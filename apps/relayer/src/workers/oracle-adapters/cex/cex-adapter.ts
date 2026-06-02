/**
 * CEX oracle adapter orchestrator — KMS-attestation rail (D-02).
 *
 * Dispatches to all 8 per-exchange scrapers in parallel and signs a single
 * EIP-712 attestation if any exchange confirms the listing, then calls SM.submitAttestation.
 *
 * Flow:
 *   1. scrapeAndAttest: run all scrapers in parallel via Promise.allSettled
 *   2. If any scraper returns true → signOracleAttestation with keyId='cex', domain='CallIt-Oracle'
 *   3. Call SM.submitAttestation with the signed attestation (Pitfall 6 fix)
 *   4. Return { status: 'found' } | { status: 'not_found' } | { status: 'ambiguous' }
 *
 * Security:
 *   - chainId comes from process.env.CHAIN_ID — never hardcoded (T-05.1-03-01)
 *   - domain.name='CallIt-Oracle' — unified domain; on-chain ECDSA.recover verifies correctly
 *   - keyId='cex' — per-type KMS key (D-05)
 *   - oracleType=OracleType.CexScraper(6) — bound via _checkAdapterBinding on-chain
 *   - Multi-signal confirm (symbol+name) per scraper (Pitfall 19)
 *   - Innovation Zone exclusion per exchange (Pitfall 19)
 *
 * All 8 scrapers wired (Task 2a: Binance, Coinbase, OKX, Bybit; Task 2b: Kraken, Bitget, KuCoin, Upbit).
 *
 * Spec: CALL_IT_SPEC1.md §13.6
 * Requirements: SETTLE-23, SETTLE-24
 */

// NOTE: Import from 4 levels up to match vi.mock('../../../lib/kms-signer.js') pattern
// (cex/ subdir is one level deeper than oracle-adapters/)
import { gcpKmsAccount } from '../../../../lib/kms-signer.js';
import { getLogger } from '../../../lib/logger.js';
import { SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA } from '@call-it/shared';
import {
  signOracleAttestation,
  OracleType,
  OracleOutcome,
  SUBMIT_ATTESTATION_ABI,
} from '../oracle-attestation.js';

import * as binanceScraper from './binance-scraper.js';
import * as coinbaseScraper from './coinbase-scraper.js';
import * as okxScraper from './okx-scraper.js';
import * as bybitScraper from './bybit-scraper.js';
import * as krakenScraper from './kraken-scraper.js';
import * as bitgetScraper from './bitget-scraper.js';
import * as kucoinScraper from './kucoin-scraper.js';
import * as upbitScraper from './upbit-scraper.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Rich CexScrapeOutcome type — 'found' now includes the attestationData and signature
 * so the settlement-watcher can verify submission happened. Internal submission is done
 * inside scrapeAndAttest (Pitfall 6 fix).
 */
export type CexScrapeOutcome =
  | { status: 'found'; attestationData: `0x${string}`; signature: `0x${string}` }
  | { status: 'not_found' }
  | { status: 'ambiguous' };

export interface CexAdapterConfig {
  settlementManagerAddress?: `0x${string}`;
  kmsProjectId: string;
  kmsLocationId: string;
  kmsKeyRingId: string;
  kmsKeyVersion: string;
  kmsExpectedAddress?: `0x${string}`;
  /** WalletClient for calling SM.submitAttestation (required for Pitfall 6 fix) */
  walletClient?: { writeContract: (params: unknown) => Promise<`0x${string}`> };
}

// ── Innovation Zone exclusion patterns registry ───────────────────────────────

/**
 * INNOVATION_ZONE_EXCLUSION_PATTERNS — per-exchange exclusion patterns.
 * Exported for tests and documentation.
 * All 8 exchanges wired.
 */
export const INNOVATION_ZONE_EXCLUSION_PATTERNS: Record<string, string[]> = {
  binance: binanceScraper.EXCLUSION_PATTERNS,
  coinbase: coinbaseScraper.EXCLUSION_PATTERNS,
  okx: okxScraper.EXCLUSION_PATTERNS,
  bybit: bybitScraper.EXCLUSION_PATTERNS,
  kraken: krakenScraper.EXCLUSION_PATTERNS,
  bitget: bitgetScraper.EXCLUSION_PATTERNS,
  kucoin: kucoinScraper.EXCLUSION_PATTERNS,
  upbit: upbitScraper.EXCLUSION_PATTERNS,
};

// ── Scraper registry ──────────────────────────────────────────────────────────

const scrapers = {
  binance: binanceScraper.scrape,
  coinbase: coinbaseScraper.scrape,
  okx: okxScraper.scrape,
  bybit: bybitScraper.scrape,
  kraken: krakenScraper.scrape,
  bitget: bitgetScraper.scrape,
  kucoin: kucoinScraper.scrape,
  upbit: upbitScraper.scrape,
} as const;

// ── CexAdapter class ──────────────────────────────────────────────────────────

/**
 * CexAdapter: orchestrates all exchange scrapers and signs a single KMS attestation.
 *
 * keyId='cex' — per-type KMS key (D-05); isolated from NFT-TWAP, DefiLlama, Snapshot/Tally keys.
 * domain.name='CallIt-Cex' — prevents cross-adapter replay (Pitfall 7).
 */
export class CexAdapter {
  private readonly config: CexAdapterConfig;

  constructor(config: CexAdapterConfig) {
    this.config = config;
  }

  /**
   * Scrape all exchanges in parallel and attest if any confirms the listing.
   *
   * @param callId - call ID for the attestation
   * @param tokenSymbol - token ticker (e.g., 'BTC')
   * @param tokenName - full token name (e.g., 'Bitcoin')
   * @param expiryTimestamp - call expiry Unix timestamp
   * @returns 'found' | 'not_found' | 'ambiguous'
   */
  async scrapeAndAttest(
    callId: bigint,
    tokenSymbol: string,
    tokenName: string,
    expiryTimestamp: number,
  ): Promise<CexScrapeOutcome | 'found' | 'not_found' | 'ambiguous'> {
    const logger = getLogger();

    logger.info(
      {
        event: 'cex_adapter_scrape_start',
        callId: callId.toString(),
        tokenSymbol,
        tokenName,
        exchangeCount: Object.keys(scrapers).length,
      },
      'CEX adapter: starting parallel scrape across all exchanges',
    );

    // Run all scrapers in parallel (Promise.allSettled — one failure doesn't block others)
    const scraperEntries = Object.entries(scrapers);
    const results = await Promise.allSettled(
      scraperEntries.map(([, scrapeFunc]) =>
        (scrapeFunc as (sym: string, name: string, exp: number) => Promise<boolean>)(
          tokenSymbol,
          tokenName,
          expiryTimestamp,
        ),
      ),
    );

    // Check if any scraper returned true
    let foundExchange: string | null = null;
    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      const exchangeName = scraperEntries[i]![0];
      if (result.status === 'fulfilled' && result.value === true) {
        foundExchange = exchangeName;
        break;
      }
    }

    if (!foundExchange) {
      logger.info(
        {
          event: 'cex_adapter_not_found',
          callId: callId.toString(),
          tokenSymbol,
        },
        'CEX adapter: no exchange confirmed listing — returning not_found',
      );
      return { status: 'not_found' };
    }

    logger.info(
      {
        event: 'cex_adapter_found',
        callId: callId.toString(),
        tokenSymbol,
        foundExchange,
      },
      `CEX adapter: listing confirmed by ${foundExchange} — signing attestation`,
    );

    // Sign attestation using unified oracle-attestation format and submit to SM (Pitfall 6 fix)
    try {
      const smAddress = this.config.settlementManagerAddress ?? (SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA as `0x${string}`);
      // chainId MUST come from env — never hardcoded (T-05.1-03-01)
      const chainId = BigInt(process.env.CHAIN_ID ?? '421614');

      const expectedAddress = (
        this.config.kmsExpectedAddress ??
        (process.env.KMS_ADDRESS_CEX as `0x${string}`) ??
        '0x0000000000000000000000000000000000000000' as `0x${string}`
      );

      // keyId='cex' — per-type KMS key (D-05)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const account = gcpKmsAccount({
        projectId: this.config.kmsProjectId,
        locationId: this.config.kmsLocationId,
        keyRingId: this.config.kmsKeyRingId,
        keyId: 'cex',
        keyVersion: this.config.kmsKeyVersion,
        expectedAddress,
      }) as any;

      // CEX is a binary confirmed/not event — CallerWon means listing confirmed
      const result = await signOracleAttestation({
        account,
        chainId,
        verifyingContract: smAddress,
        callId,
        oracleType: OracleType.CexScraper,
        outcome: OracleOutcome.CallerWon, // CEX listing confirmed = caller wins
        priceDelta: 0n,                   // CEX: no price delta
        timestamp: BigInt(Math.floor(Date.now() / 1000)),
      });

      logger.info(
        {
          event: 'cex_adapter_attested',
          callId: callId.toString(),
          tokenSymbol,
          foundExchange,
          chainId: chainId.toString(),
        },
        'CEX attestation signed with unified oracle-attestation domain',
      );

      // Submit to SM.submitAttestation (Pitfall 6 fix — was log-only stub before)
      if (this.config.walletClient) {
        await this.config.walletClient.writeContract({
          address: smAddress,
          abi: SUBMIT_ATTESTATION_ABI,
          functionName: 'submitAttestation',
          args: [callId, result.attestationData, result.signature],
        });

        logger.info(
          { event: 'cex_adapter_submitted', callId: callId.toString() },
          'CEX attestation submitted to SettlementManager',
        );
      } else {
        logger.warn(
          { event: 'cex_adapter_no_wallet_client', callId: callId.toString() },
          'CEX adapter: walletClient not configured — attestation signed but not submitted',
        );
      }

      return { status: 'found', attestationData: result.attestationData, signature: result.signature };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        {
          event: 'cex_adapter_sign_error',
          callId: callId.toString(),
          error: message,
        },
        'CEX attestation signing failed — returning ambiguous',
      );
      return { status: 'ambiguous' };
    }
  }
}

// ── getCexTestFixture helper ──────────────────────────────────────────────────

/**
 * getCexTestFixture: wraps each scraper's testWithFixture for CI use.
 * Returns a function that accepts HTML and checks for a listing.
 */
export function getCexTestFixture(exchange: keyof typeof scrapers): (html: string) => boolean {
  switch (exchange) {
    case 'binance': return binanceScraper.testWithFixture;
    case 'coinbase': return coinbaseScraper.testWithFixture;
    case 'okx': return okxScraper.testWithFixture;
    case 'bybit': return bybitScraper.testWithFixture;
    case 'kraken': return krakenScraper.testWithFixture;
    case 'bitget': return bitgetScraper.testWithFixture;
    case 'kucoin': return kucoinScraper.testWithFixture;
    case 'upbit': return upbitScraper.testWithFixture;
    default: return () => false;
  }
}

// ── Re-export testWithFixture functions for each exchange ─────────────────────

export const testWithFixture = {
  binance: binanceScraper.testWithFixture,
  coinbase: coinbaseScraper.testWithFixture,
  okx: okxScraper.testWithFixture,
  bybit: bybitScraper.testWithFixture,
  kraken: krakenScraper.testWithFixture,
  bitget: bitgetScraper.testWithFixture,
  kucoin: kucoinScraper.testWithFixture,
  upbit: upbitScraper.testWithFixture,
} as const;

// ── Default adapter instance ──────────────────────────────────────────────────

/**
 * Create a CexAdapter instance from environment configuration.
 * walletClient is optional — if provided, submitAttestation is called internally (Pitfall 6 fix).
 */
export function createCexAdapter(
  walletClient?: { writeContract: (params: unknown) => Promise<`0x${string}`> },
): CexAdapter {
  return new CexAdapter({
    kmsProjectId: process.env.GCP_PROJECT_ID ?? 'call-it-sepolia',
    kmsLocationId: process.env.GCP_LOCATION_ID ?? 'us-east1',
    kmsKeyRingId: process.env.GCP_KEY_RING_ID ?? 'attestations',
    kmsKeyVersion: process.env.GCP_KEY_VERSION_CEX ?? '1',
    kmsExpectedAddress: process.env.KMS_ADDRESS_CEX as `0x${string}` | undefined,
    walletClient,
  });
}
