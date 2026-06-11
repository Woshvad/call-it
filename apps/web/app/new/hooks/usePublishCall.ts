'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { UseFormSetError } from 'react-hook-form';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount } from 'wagmi';
import { encodeFunctionData } from 'viem';
import type { CreateCallInput } from '@call-it/shared';
import {
  MARKET_TYPE_TO_UINT,
  EVENT_SUBTYPE_TO_UINT,
  CATEGORY_TO_UINT,
} from '@call-it/shared';
import { callRegistryAbi } from '@/lib/abis';
import { createAaClient } from '@/lib/aa-config';
import { useCirclePaymaster } from '@/hooks/useCirclePaymaster';
import { useToast } from '@call-it/ui';
import { RelayerError, postPreflight } from '@/lib/relayer-client';
import { buildPreflightBody } from '../lib/preflight-body';
import { keccak256, toBytes } from 'viem';

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

export interface PublishState {
  isPublishing: boolean;
  step: 'idle' | 'preflight' | 'signing' | 'waiting' | 'success' | 'error';
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
 * Flow (D-28, Plan 07 paymaster handoff):
 *   1. POST /api/calls/preflight — server-side gate; on 422 → setError fields + close modal
 *   2. Build calldata via encodeFunctionData({ abi: callRegistryAbi, functionName: 'createCall' })
 *   3. Create AA client via createAaClient() (Plan 05 stub, wired in Plan 07/08)
 *   4. sendUserOperation with ERC-7677 paymaster
 *   5. On -32000 sponsorship-cap-exceeded → call useCirclePaymaster().buildPaymasterAndData()
 *   6. waitForUserOperationReceipt → toast success → redirect to /profile/{address}
 *
 * Requirement: CALL-37..70, AUTH-27, AUTH-33, AUTH-34, D-28, D-31
 */
export function usePublishCall(
  setError: UseFormSetError<CreateCallInput>,
) {
  const router = useRouter();
  const { getAccessToken } = usePrivy();
  const { address } = useAccount();
  const { buildPaymasterAndData, isConfigured: isCircleConfigured } = useCirclePaymaster();
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
        setState((s) => ({ ...s, error: 'Wallet not connected', step: 'error' }));
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

        // ─── Step 2: Build calldata ────────────────────────────────────────
        setState((s) => ({ ...s, step: 'signing' }));

        const criteriaHash = input.criteriaText
          ? keccak256(toBytes(input.criteriaText))
          : '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`;

        const calldata = encodeFunctionData({
          abi: callRegistryAbi,
          functionName: 'createCall',
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

        // ─── Step 3: Send userOp via AA client ────────────────────────────
        const aaClient = createAaClient(null);
        let userOpHash: `0x${string}`;

        try {
          userOpHash = await aaClient.sendUserOperation(calldata);
        } catch (err: unknown) {
          // Check for sponsorship-cap-exceeded error from relayer paymaster (-32000)
          const errMsg = err instanceof Error ? err.message : String(err);
          if (
            errMsg.includes('sponsorship-cap-exceeded') ||
            errMsg.includes('-32000')
          ) {
            if (isCircleConfigured) {
              // D-06: Handoff to Circle USDC Paymaster for tx 6+
              const paymasterAndData = await buildPaymasterAndData(
                null,
                2_000_000n, // estimate $2 USDC max gas
              );
              // TODO: Re-submit userOp with paymasterAndData (requires full AA client wiring)
              // For Phase 1, surface a clear error so the user knows to enable Circle paymaster
              throw new Error(
                `Circle paymaster handoff required (tx 6+). paymasterAndData built: ${paymasterAndData.slice(0, 10)}...`,
              );
            } else {
              throw new Error(
                'Sponsorship cap exceeded. Please configure NEXT_PUBLIC_CIRCLE_PAYMASTER_ADDRESS to continue.',
              );
            }
          }
          throw err;
        }

        // ─── Step 4: Wait for receipt ──────────────────────────────────────
        setState((s) => ({ ...s, step: 'waiting', txHash: userOpHash }));
        await aaClient.waitForUserOperationReceipt(userOpHash);

        // ─── Step 5: Success ──────────────────────────────────────────────
        setState((s) => ({ ...s, step: 'success', isPublishing: false }));

        showToast({
          status: 'success',
          message: 'Call published successfully!',
          duration: 5000,
        });

        // Redirect to profile (Plan 09 will route to /call/[id] once feed is live)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.push(`/profile/${address}` as any);

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

        const message =
          err instanceof Error ? err.message : 'Failed to publish call';

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
      buildPaymasterAndData,
      isCircleConfigured,
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
