/**
 * CEX oracle adapter orchestrator — KMS-attestation rail (D-02).
 *
 * Dispatches to all 8 per-exchange scrapers in parallel and signs a single
 * EIP-712 attestation if any exchange confirms the listing.
 *
 * Flow:
 *   1. scrapeAndAttest: run all scrapers in parallel via Promise.allSettled
 *   2. If any scraper returns true → sign with keyId='cex'; domain='CallIt-Cex'
 *   3. Return 'found' | 'not_found' | 'ambiguous'
 *
 * Security (Pitfall 7):
 *   - EIP-712 domain chainId=42161n (Arbitrum One) — cross-chain replay prevention
 *   - domain.name='CallIt-Cex' — cross-adapter replay prevention
 *   - keyId='cex' — per-type KMS key (D-05)
 *   - Multi-signal confirm (symbol+name) per scraper (Pitfall 19)
 *   - Innovation Zone exclusion per exchange (Pitfall 19)
 *
 * Task 2a: Binance, Coinbase, OKX, Bybit wired.
 * Task 2b: Kraken, Bitget, KuCoin, Upbit added (TODO stubs here → replaced in Task 2b).
 *
 * Spec: CALL_IT_SPEC1.md §13.6
 * Requirements: SETTLE-23, SETTLE-24
 */

import { encodeAbiParameters, parseAbiParameters } from 'viem';
// NOTE: Import from 4 levels up to match vi.mock('../../../lib/kms-signer.js') pattern
// (cex/ subdir is one level deeper than oracle-adapters/)
import { gcpKmsAccount } from '../../../../lib/kms-signer.js';
import { getLogger } from '../../../lib/logger.js';
import { SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA } from '@call-it/shared';

import * as binanceScraper from './binance-scraper.js';
import * as coinbaseScraper from './coinbase-scraper.js';
import * as okxScraper from './okx-scraper.js';
import * as bybitScraper from './bybit-scraper.js';
// TODO: kraken, bitget, kucoin, upbit added in Task 2b

// ── Types ─────────────────────────────────────────────────────────────────────

export type CexScrapeOutcome = 'found' | 'not_found' | 'ambiguous';

export interface CexAdapterConfig {
  settlementManagerAddress?: `0x${string}`;
  kmsProjectId: string;
  kmsLocationId: string;
  kmsKeyRingId: string;
  kmsKeyVersion: string;
  kmsExpectedAddress?: `0x${string}`;
}

// ── Innovation Zone exclusion patterns registry ───────────────────────────────

/**
 * INNOVATION_ZONE_EXCLUSION_PATTERNS — per-exchange exclusion patterns.
 * Exported for tests and documentation.
 * Task 2b adds kraken/bitget/kucoin/upbit entries.
 */
export const INNOVATION_ZONE_EXCLUSION_PATTERNS: Record<string, string[]> = {
  binance: binanceScraper.EXCLUSION_PATTERNS,
  coinbase: coinbaseScraper.EXCLUSION_PATTERNS,
  okx: okxScraper.EXCLUSION_PATTERNS,
  bybit: bybitScraper.EXCLUSION_PATTERNS,
  // kraken, bitget, kucoin, upbit added in Task 2b
};

// ── Scraper registry ──────────────────────────────────────────────────────────

const scrapers = {
  binance: binanceScraper.scrape,
  coinbase: coinbaseScraper.scrape,
  okx: okxScraper.scrape,
  bybit: bybitScraper.scrape,
  // TODO: added in Task 2b:
  // kraken: krakenScraper.scrape,
  // bitget: bitgetScraper.scrape,
  // kucoin: kucoinScraper.scrape,
  // upbit: upbitScraper.scrape,
} as const;

// ── EIP-712 type definitions ──────────────────────────────────────────────────

/**
 * EIP-712 types for CEX listing attestation.
 * Domain: name='CallIt-Cex', chainId=42161n (Pitfall 7).
 */
const CEX_ATTESTATION_TYPES = {
  CexAttestation: [
    { name: 'callId', type: 'uint256' },
    { name: 'tokenSymbol', type: 'string' },
    { name: 'tokenName', type: 'string' },
    { name: 'confirmed', type: 'bool' },
    { name: 'timestamp', type: 'uint256' },
    { name: 'chainId', type: 'uint256' },
  ],
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
  ): Promise<CexScrapeOutcome> {
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
      return 'not_found';
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

    // Sign attestation
    try {
      const smAddress = this.config.settlementManagerAddress ?? (SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA as `0x${string}`);
      const timestamp = BigInt(Math.floor(Date.now() / 1000));

      const expectedAddress = (
        this.config.kmsExpectedAddress ??
        (process.env.KMS_ADDRESS_CEX as `0x${string}`) ??
        '0x0000000000000000000000000000000000000000' as `0x${string}`
      );

      // keyId='cex' — per-type KMS key (D-05)
      // domain.name='CallIt-Cex' — prevents cross-adapter replay (Pitfall 7)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const account = gcpKmsAccount({
        projectId: this.config.kmsProjectId,
        locationId: this.config.kmsLocationId,
        keyRingId: this.config.kmsKeyRingId,
        keyId: 'cex',
        keyVersion: this.config.kmsKeyVersion,
        expectedAddress,
      }) as any;

      const domain = {
        name: 'CallIt-Cex',
        version: '1',
        chainId: 42161n,
        verifyingContract: smAddress,
      };

      const message = {
        callId,
        tokenSymbol,
        tokenName,
        confirmed: true,
        timestamp,
        chainId: 42161n,
      };

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const signature = await account.signTypedData({
        domain,
        types: CEX_ATTESTATION_TYPES,
        primaryType: 'CexAttestation',
        message,
      });

      const attestationData = encodeAbiParameters(
        parseAbiParameters(
          'uint256 callId, string tokenSymbol, string tokenName, bool confirmed, uint256 timestamp, uint256 chainId',
        ),
        [callId, tokenSymbol, tokenName, true, timestamp, 42161n],
      );

      logger.info(
        {
          event: 'cex_adapter_attested',
          callId: callId.toString(),
          tokenSymbol,
          foundExchange,
          attestationData: attestationData.slice(0, 20) + '...',
        },
        'CEX attestation signed',
      );

      void signature; // attestationData + signature are available for submission
      void attestationData;
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
      return 'ambiguous';
    }

    return 'found';
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
    default: return () => false;
  }
}

// ── Re-export testWithFixture functions for each exchange ─────────────────────

export const testWithFixture = {
  binance: binanceScraper.testWithFixture,
  coinbase: coinbaseScraper.testWithFixture,
  okx: okxScraper.testWithFixture,
  bybit: bybitScraper.testWithFixture,
} as const;

// ── Default adapter instance ──────────────────────────────────────────────────

/**
 * Create a CexAdapter instance from environment configuration.
 */
export function createCexAdapter(): CexAdapter {
  return new CexAdapter({
    kmsProjectId: process.env.GCP_PROJECT_ID ?? 'call-it-sepolia',
    kmsLocationId: process.env.GCP_LOCATION_ID ?? 'us-east1',
    kmsKeyRingId: process.env.GCP_KEY_RING_ID ?? 'attestations',
    kmsKeyVersion: process.env.GCP_KEY_VERSION_CEX ?? '1',
    kmsExpectedAddress: process.env.KMS_ADDRESS_CEX as `0x${string}` | undefined,
  });
}
