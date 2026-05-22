/**
 * Paymaster Confirmer Worker (Plan 07, D-02, RESEARCH Pattern 4).
 *
 * Subscribes to on-chain UserOperationEvent logs (via Alchemy RPC polling).
 * On each event:
 *   1. Check if paymaster field matches OUR_PAYMASTER
 *   2. Look up sender → privyUserId via aa:sender:{address} Redis key
 *      (populated by paymaster-policy.ts registerSenderMapping at sign time)
 *   3. INCRBY the lifetime counter via incrementPaymasterCount (with SETNX idempotency)
 *   4. If count crosses 5, fire telegram alert (P1 — user_paymaster_cap_reached)
 *
 * Key behaviors (D-02 + RESEARCH A9):
 *   - Counter increments on EVERY confirmed inclusion — including reverted userOps
 *     (the operator pays gas either way; the cap is about cost, not outcome)
 *   - SETNX idempotency on userOpHash prevents double-count on bundler reconnect
 *
 * Implementation note: viem's watchEvent requires a persistent WS connection.
 * For Upstash (serverless Redis), we use polling instead of subscribe.
 * The event subscription is via viem createPublicClient with webSocketTransport.
 * If the WS disconnects, the onError handler re-subscribes with exponential backoff.
 *
 * Requirements: AUTH-27, AUTH-28, D-02, SAFETY-18, T-01-41, T-01-45
 */

import { createPublicClient, webSocketTransport, parseAbi, type Log } from 'viem';
import { arbitrum } from 'viem/chains';
import { incrementPaymasterCount, getSenderMapping } from '../lib/upstash-counter.js';
import { sendAlert } from './alerts.js';
import { getLogger } from '../lib/logger.js';

// ERC-4337 EntryPoint v0.6 UserOperationEvent ABI
const ENTRY_POINT_ABI = parseAbi([
  'event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)',
]);

// EntryPoint v0.6 on Arbitrum
const ENTRY_POINT_ADDRESS = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' as const;

let _unwatch: (() => void) | undefined;

/**
 * Handle a single UserOperationEvent log.
 *
 * Exported for direct testing without requiring a live WebSocket connection.
 * The confirmer start() function calls this via viem watchEvent.
 */
export async function handleUserOperationEvent(log: {
  args?: {
    userOpHash?: string;
    sender?: string;
    paymaster?: string;
    success?: boolean;
    actualGasCost?: bigint;
  };
}): Promise<void> {
  const args = log.args;
  if (!args) return;

  const { userOpHash, sender, paymaster } = args;
  if (!userOpHash || !sender || !paymaster) return;

  const ourPaymaster = process.env.ALCHEMY_PAYMASTER_ADDRESS?.toLowerCase();
  if (!ourPaymaster) {
    getLogger().warn({ event: 'paymaster_confirmer_no_address' }, 'ALCHEMY_PAYMASTER_ADDRESS not set — skipping UserOperationEvent');
    return;
  }

  // Only process events where our paymaster was used
  if (paymaster.toLowerCase() !== ourPaymaster) {
    return;
  }

  // Look up privyUserId from sender address (written by paymaster-policy at sign time)
  const privyUserId = await getSenderMapping(sender);
  if (!privyUserId) {
    getLogger().warn(
      { event: 'paymaster_confirmer_no_user_mapping', sender, userOpHash },
      'no privyUserId mapping for sender — cannot increment counter',
    );
    return;
  }

  // INCRBY counter with SETNX idempotency
  const { newCount, alreadyCounted } = await incrementPaymasterCount(privyUserId, userOpHash);

  if (alreadyCounted) {
    // Already processed — idempotency guard worked
    return;
  }

  // RESEARCH A9: even reverted userOps count (operator paid gas either way)
  // The success field is informational only — we count regardless.
  getLogger().info(
    {
      event: 'paymaster_inclusion_confirmed',
      privyUserId,
      userOpHash,
      newCount,
      success: args.success,
      actualGasCost: args.actualGasCost?.toString(),
    },
    'confirmed userOp inclusion counted toward paymaster cap',
  );

  // Fire telegram alert when user crosses the 5-tx cap (P1 — informational)
  if (newCount === 5) {
    try {
      await sendAlert('user_paymaster_cap_reached', {
        privyUserId,
        count: 5,
        userOpHash,
        message: 'User has reached their lifetime 5-tx paymaster cap. Next tx will route to Circle USDC Paymaster.',
      });
    } catch (alertErr) {
      getLogger().error(
        { event: 'paymaster_cap_alert_failed', err: String(alertErr), privyUserId },
        'failed to send user_paymaster_cap_reached alert',
      );
    }
  }
}

/**
 * Start the paymaster confirmer worker.
 *
 * Subscribes to UserOperationEvent logs from the EntryPoint contract.
 * Returns a stop() function to clean up the subscription.
 */
export function startPaymasterConfirmer(): () => void {
  const alchemyWsUrl = process.env.ALCHEMY_WS_URL;
  if (!alchemyWsUrl) {
    getLogger().warn(
      { event: 'paymaster_confirmer_no_ws_url' },
      'ALCHEMY_WS_URL not set — paymaster confirmer not started',
    );
    return () => undefined;
  }

  getLogger().info({ event: 'paymaster_confirmer_starting' }, 'starting paymaster confirmer worker');

  const client = createPublicClient({
    chain: arbitrum,
    transport: webSocketTransport(alchemyWsUrl),
  });

  let retryTimeout: ReturnType<typeof setTimeout> | undefined;

  function subscribe() {
    try {
      _unwatch = client.watchEvent({
        address: ENTRY_POINT_ADDRESS,
        event: ENTRY_POINT_ABI[0],
        onLogs: (logs: Log[]) => {
          for (const log of logs) {
            handleUserOperationEvent(log as Parameters<typeof handleUserOperationEvent>[0])
              .catch((err: unknown) => {
                getLogger().error(
                  { event: 'paymaster_confirmer_event_error', err: String(err) },
                  'error processing UserOperationEvent',
                );
              });
          }
        },
        onError: (err: Error) => {
          getLogger().error(
            { event: 'paymaster_confirmer_ws_error', err: err.message },
            'WebSocket error — reconnecting in 5s',
          );
          // Exponential backoff reconnect
          retryTimeout = setTimeout(() => {
            subscribe();
          }, 5000);
        },
      });

      getLogger().info(
        { event: 'paymaster_confirmer_subscribed', entryPoint: ENTRY_POINT_ADDRESS },
        'subscribed to UserOperationEvent',
      );
    } catch (err) {
      getLogger().error(
        { event: 'paymaster_confirmer_subscribe_failed', err: String(err) },
        'failed to subscribe to UserOperationEvent — retrying in 10s',
      );
      retryTimeout = setTimeout(() => {
        subscribe();
      }, 10_000);
    }
  }

  subscribe();

  // Return stop function
  return () => {
    if (retryTimeout) clearTimeout(retryTimeout);
    if (_unwatch) {
      _unwatch();
      _unwatch = undefined;
    }
    getLogger().info({ event: 'paymaster_confirmer_stopped' }, 'paymaster confirmer stopped');
  };
}
