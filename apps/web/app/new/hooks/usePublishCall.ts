'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { UseFormSetError } from 'react-hook-form';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount } from 'wagmi';
import {
  getBalance,
  readContract,
  writeContract,
  waitForTransactionReceipt,
} from 'wagmi/actions';
import type { CreateCallInput } from '@call-it/shared';
import {
  MARKET_TYPE_TO_UINT,
  EVENT_SUBTYPE_TO_UINT,
  CATEGORY_TO_UINT,
  CREATION_FEE,
} from '@call-it/shared';
import { callRegistryAbi, erc20Abi } from '@/lib/abis';
import { wagmiConfig } from '@/lib/wagmi';
import {
  ACTIVE_CHAIN_ID,
  USDC_ADDRESS,
  CALL_REGISTRY_ADDRESS,
} from '@/lib/chain';
import { useToast } from '@call-it/ui';
import { RelayerError, postPreflight } from '@/lib/relayer-client';
import { buildPreflightBody } from '../lib/preflight-body';
import {
  extractCallIdFromLogs,
  extractRevertErrorName,
  isUserRejection,
} from '../lib/call-created-log';
import { BaseError, InsufficientFundsError, keccak256, toBytes } from 'viem';

/**
 * RHF fields with NO visible form input / error slot on /new. A 422 whose
 * errors ALL land here would render nothing "below" — so the toast must carry
 * the actual message instead of the bare generic line (quick-260611-bf2).
 */
const HIDDEN_ERROR_FIELDS = new Set([
  'marketType',
  'eventSubtype',
  'category',
  'expiry',
  'parentCallId',
  'callerAddress',
  'callerSettledCalls',
  'root',
]);

/**
 * Minimum native-token balance required before we attempt ANY transaction.
 * 0.00001 ETH — far below one tx's actual gas cost, so this only catches the
 * truly-empty (0 ETH) wallet case and directs the user to a faucet instead of
 * letting the wallet throw an opaque gas-estimation error.
 */
const GAS_FLOOR_WEI = 10_000_000_000_000n;

/**
 * Faucet-direction copy — shared by the pre-tx gas guard AND the catch-side
 * InsufficientFundsError walk (WR-01, quick-260611-co5 review): the guard's
 * floor is deliberately below one tx's real cost, so a dust wallet can pass
 * the guard and still die in approve/createCall with insufficient funds —
 * that path must surface the SAME message, not viem's multi-paragraph error.
 */
const FAUCET_MESSAGE =
  'This wallet has no Sepolia ETH for gas — get a free drip from a faucet (e.g. the Alchemy Arbitrum Sepolia faucet), then retry.';

/**
 * wagmi/actions take the typed wagmiConfig as their first argument, so the
 * `chainId` param is narrowed to the config's chain-id union (421614 | 42161).
 * ACTIVE_CHAIN_ID is declared `number` in @/lib/chain — narrow it here.
 */
type ActiveChainId = (typeof wagmiConfig)['chains'][number]['id'];

export interface PublishState {
  isPublishing: boolean;
  step: 'idle' | 'preflight' | 'approving' | 'signing' | 'waiting' | 'success' | 'error';
  error: string | null;
  txHash: string | null;
}

/**
 * Terminal result of a publish() call. Returned (not just stored in state) so
 * callers can branch on the outcome synchronously after `await publish(...)`
 * instead of reading a stale `step` closure (WR-01).
 */
export interface PublishResult {
  status: 'success' | 'error';
}

/**
 * usePublishCall — orchestrates the full call publish flow.
 *
 * Flow (D-28, direct EOA — quick-260611-co5):
 *   1. POST /api/calls/preflight — server-side gate; on 422 → setError fields + close modal
 *   2. Gas guard — getBalance; 0-ETH wallets get a faucet-direction toast BEFORE any tx
 *   3. USDC allowance check — approve(stake + CREATION_FEE) when allowance is short
 *   4. CallRegistry.createCall via direct wagmi writeContract (connected EOA signs)
 *   5. waitForTransactionReceipt → extract callId from the CallCreated log
 *   6. Toast success → redirect to /call/{callId} (the receipt page)
 *
 * Direct EOA until the AA client lands (quick-260611-co5 — the AA stub at
 * lib/aa-config.ts was never wired; verified live 2026-06-11). No gas
 * sponsorship is configured, so the wallet needs Sepolia ETH for gas.
 *
 * Requirement: CALL-37..70, AUTH-27, AUTH-33, AUTH-34, D-28, D-31
 */
export function usePublishCall(
  setError: UseFormSetError<CreateCallInput>,
) {
  const router = useRouter();
  const { getAccessToken } = usePrivy();
  const { address } = useAccount();
  const { show: showToast } = useToast();

  const [state, setState] = useState<PublishState>({
    isPublishing: false,
    step: 'idle',
    error: null,
    txHash: null,
  });

  const publish = useCallback(
    async (input: CreateCallInput): Promise<PublishResult> => {
      if (!address) {
        // WR-02 (quick-260611-co5 review): the caller closes the modal
        // unconditionally after publish() resolves and nothing on /new renders
        // state.error inline — without a toast this branch is a silent
        // dead-end (modal closes, nothing visible happens).
        const msg = 'Wallet not connected — sign in again, then retry.';
        showToast({ status: 'error', message: msg, duration: 5000 });
        setState((s) => ({ ...s, error: msg, step: 'error', isPublishing: false }));
        return { status: 'error' };
      }

      setState({ isPublishing: true, step: 'preflight', error: null, txHash: null });

      try {
        // ─── Step 0: Build the preflight body + calldata asset uints ────────
        // quick-260611-bf2: buildPreflightBody is the SINGLE source of the
        // string-enum wire body (BUG 1) AND the resolved assetA/assetB uints
        // (BUG 2 — dup-hash consistency invariant). Unresolvable assets abort
        // HERE, before getAccessToken() — i.e. before ANY network call.
        const built = buildPreflightBody(input, address);
        if (!built.ok) {
          setError(built.field, { type: 'resolve', message: built.message });
          showToast({ status: 'error', message: built.message, duration: 5000 });
          setState({
            isPublishing: false,
            step: 'error',
            error: built.message,
            txHash: null,
          });
          return { status: 'error' };
        }

        // ─── Step 1: Server-side preflight (D-28) ──────────────────────────
        const token = await getAccessToken();
        const preflight = await postPreflight(built.body, token ?? undefined);

        // Apply suggested conviction (auto-cap from Gate 6.3)
        const effectiveConviction = preflight.suggestedConviction;

        // ─── Step 2: Gas guard — BEFORE any transaction ────────────────────
        // No Privy gas sponsorship is configured; a direct EOA write needs
        // native ETH for gas. A 0-ETH wallet would otherwise stall on an
        // opaque gas-estimation error — direct it to a faucet instead.
        const balance = await getBalance(wagmiConfig, {
          address,
          chainId: ACTIVE_CHAIN_ID as ActiveChainId,
        });
        if (balance.value < GAS_FLOOR_WEI) {
          showToast({ status: 'error', message: FAUCET_MESSAGE, duration: 5000 });
          setState({
            isPublishing: false,
            step: 'error',
            error: FAUCET_MESSAGE,
            txHash: null,
          });
          return { status: 'error' };
        }

        // ─── Step 3: USDC allowance check + approve when short ─────────────
        // CallRegistry pulls stake + the $10 creation fee in one transferFrom.
        const allowance = await readContract(wagmiConfig, {
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [address, CALL_REGISTRY_ADDRESS],
          chainId: ACTIVE_CHAIN_ID as ActiveChainId,
        });
        const required = input.stake + CREATION_FEE;

        if (allowance < required) {
          setState((s) => ({ ...s, step: 'approving' }));
          const approveHash = await writeContract(wagmiConfig, {
            address: USDC_ADDRESS,
            abi: erc20Abi,
            functionName: 'approve',
            args: [CALL_REGISTRY_ADDRESS, required],
            chainId: ACTIVE_CHAIN_ID as ActiveChainId,
          });
          const approveReceipt = await waitForTransactionReceipt(wagmiConfig, {
            hash: approveHash,
            chainId: ACTIVE_CHAIN_ID as ActiveChainId,
          });
          if (approveReceipt.status !== 'success') {
            throw new Error('USDC approval transaction reverted on-chain');
          }
        }

        // ─── Step 4: createCall via direct wagmi write ─────────────────────
        setState((s) => ({ ...s, step: 'signing' }));

        const criteriaHash = input.criteriaText
          ? keccak256(toBytes(input.criteriaText))
          : '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`;

        const txHash = await writeContract(wagmiConfig, {
          address: CALL_REGISTRY_ADDRESS,
          abi: callRegistryAbi,
          functionName: 'createCall',
          chainId: ACTIVE_CHAIN_ID as ActiveChainId,
          args: [
            MARKET_TYPE_TO_UINT[input.marketType],                       // marketType uint8
            EVENT_SUBTYPE_TO_UINT[input.eventSubtype ?? 'none'],          // eventSubtype uint8
            CATEGORY_TO_UINT[input.category],                             // category uint8
            built.assetAUint,  // assetA uint256 — from buildPreflightBody (dup-hash invariant)
            built.assetBUint,  // assetB uint256 — from buildPreflightBody (was hardcoded 0n)
            input.targetValue,                                            // targetValue uint256
            input.expiry,                                                 // expiry uint64
            input.stake,                                                  // stake uint96
            effectiveConviction,                                          // conviction uint8
            criteriaHash,                                                 // criteriaHash bytes32
            input.openToChallenges,                                       // openToChallenges bool
            input.parentCallId ?? 0n,                                     // parentCallId uint256
          ],
        });

        // ─── Step 5: Wait for receipt ──────────────────────────────────────
        setState((s) => ({ ...s, step: 'waiting', txHash }));
        const receipt = await waitForTransactionReceipt(wagmiConfig, {
          hash: txHash,
          chainId: ACTIVE_CHAIN_ID as ActiveChainId,
        });
        if (receipt.status !== 'success') {
          throw new Error('Transaction reverted on-chain');
        }

        // ─── Step 6: Success + redirect to the receipt page ────────────────
        const callId = extractCallIdFromLogs(receipt.logs, CALL_REGISTRY_ADDRESS);

        setState((s) => ({ ...s, step: 'success', isPublishing: false }));

        showToast({
          status: 'success',
          message: 'Call published successfully!',
          duration: 5000,
        });

        if (callId !== null) {
          // The receipt page IS the product moment.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          router.push(`/call/${callId}` as any);
        } else {
          // Defensive: a success receipt should always carry CallCreated —
          // never dead-end a succeeded tx; fall back to the profile page.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          router.push(`/profile/${address}` as any);
        }

        return { status: 'success' };
      } catch (err: unknown) {
        const isPreflightError = err instanceof RelayerError && err.status === 422;

        if (isPreflightError) {
          // D-31: Map relayer 422 errors to RHF field errors inline
          // The relayer returns { ok: false, errors: [...] } but RelayerError extracts message
          // Try to parse field errors from the error
          const relayerErr = err as RelayerError;
          if (relayerErr.fieldErrors) {
            Object.entries(relayerErr.fieldErrors).forEach(([field, messages]) => {
              const message = Array.isArray(messages) ? messages[0] : String(messages);
              setError((field as keyof CreateCallInput) || 'root', {
                type: 'preflight',
                message: message ?? 'Validation error',
              });
            });
          }
        }

        // quick-260611-co5 error honesty: user rejections and decoded
        // contract reverts surface as human-readable messages BEFORE the
        // generic err.message fallback — never a silent stall.
        const revertName = extractRevertErrorName(err);
        let message: string;
        if (isUserRejection(err)) {
          message = 'Signature request rejected — nothing was sent.';
        } else if (
          // WR-01 (quick-260611-co5 review): a dust wallet (above GAS_FLOOR_WEI
          // but below 2 real txs' gas) passes the guard and fails here — walk
          // the viem error tree and reuse the exact faucet-direction message.
          err instanceof BaseError &&
          err.walk((e) => e instanceof InsufficientFundsError) !== null
        ) {
          message = FAUCET_MESSAGE;
        } else if (revertName !== null) {
          message =
            revertName === 'AssetNotAllowlisted'
              ? "This asset isn't allowlisted on this deployment yet."
              : `Transaction reverted: ${revertName}`;
        } else {
          // WR-01: viem BaseErrors carry a one-line shortMessage — never toast
          // the full multi-paragraph err.message (request args + docs URL).
          message =
            err instanceof BaseError
              ? err.shortMessage
              : err instanceof Error
                ? err.message
                : 'Failed to publish call';
        }

        setState({
          isPublishing: false,
          step: 'error',
          error: message,
          txHash: null,
        });

        // quick-260611-bf2: a 422 whose field errors ALL land on hidden fields
        // (no visible input) must surface the actual message in the toast —
        // "Please fix the form errors below" with nothing visible below was
        // the exact dead-end users hit.
        // Initialized to err.message: a 422 with no parseable field errors
        // keeps it — never the bare generic line when there is nothing
        // visible to fix (IN-04: the explicit empty-fields branch was dead).
        let toastMessage = message;
        if (isPreflightError) {
          const fieldErrors = (err as RelayerError).fieldErrors;
          const fields = fieldErrors ? Object.keys(fieldErrors) : [];
          if (fields.length > 0 && fields.every((f) => HIDDEN_ERROR_FIELDS.has(f))) {
            const firstHidden = fieldErrors![fields[0]!];
            const firstMsg = Array.isArray(firstHidden) ? firstHidden[0] : undefined;
            toastMessage = `Preflight rejected: ${firstMsg ?? message}`;
          } else if (fields.length > 0) {
            // At least one error landed on a visible field — it renders inline.
            toastMessage = 'Please fix the form errors below';
          }
        }

        showToast({
          status: 'error',
          message: toastMessage,
          duration: 5000,
        });

        return { status: 'error' };
      }
    },
    [
      address,
      getAccessToken,
      showToast,
      router,
      setError,
    ],
  );

  const reset = useCallback(() => {
    setState({ isPublishing: false, step: 'idle', error: null, txHash: null });
  }, []);

  return { ...state, publish, reset };
}
