/**
 * Pyth feed ID constants test.
 *
 * Validates that all 25 feed IDs are correctly formatted and match
 * the values verified against Hermes API on 2026-05-21 (from CLAUDE.md).
 *
 * Key naming rules from CLAUDE.md:
 * - POL replaces MATIC (deprecated 2024) — MATIC must NOT be exported
 * - RENDER replaces RNDR — RNDR must NOT be exported
 * - KPEPE and KBONK must NOT be exported (use unscaled PEPE/BONK)
 */

import { describe, it, expect } from 'vitest';
import * as feedIds from '../src/constants/pyth-feed-ids.js';

const FEED_ID_REGEX = /^0x[0-9a-f]{64}$/;
const ZERO_BYTES32 = '0x' + '0'.repeat(64);

describe('Pyth feed ID constants', () => {
  describe('Format validation', () => {
    it('all exported PYTH_*_USD constants are 0x-prefixed 64-hex-char bytes32 strings', () => {
      const feedConstants = Object.entries(feedIds).filter(
        ([key]) => key.startsWith('PYTH_') && key.endsWith('_USD'),
      );
      expect(feedConstants.length).toBeGreaterThan(0);
      for (const [key, value] of feedConstants) {
        expect(typeof value, `${key} should be a string`).toBe('string');
        expect(
          FEED_ID_REGEX.test(value as string),
          `${key} = "${value}" should match 0x[0-9a-f]{64}`,
        ).toBe(true);
      }
    });

    it('PYTH_FEED_IDS object has exactly 24 entries', () => {
      // 24 = 19 verified + 5 TODO_VERIFY (UNI, LINK, AAVE, MKR, DOGE)
      expect(Object.keys(feedIds.PYTH_FEED_IDS)).toHaveLength(24);
    });
  });

  describe('Verified feed IDs match CLAUDE.md values exactly', () => {
    it('BTC/USD', () => {
      expect(feedIds.PYTH_BTC_USD).toBe(
        '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
      );
    });

    it('ETH/USD', () => {
      expect(feedIds.PYTH_ETH_USD).toBe(
        '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
      );
    });

    it('SOL/USD', () => {
      expect(feedIds.PYTH_SOL_USD).toBe(
        '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
      );
    });

    it('ARB/USD', () => {
      expect(feedIds.PYTH_ARB_USD).toBe(
        '0x3fa4252848f9f0a1480be62745a4629d9eb1322aebab8a791e344b3b9c1adcf5',
      );
    });

    it('OP/USD', () => {
      expect(feedIds.PYTH_OP_USD).toBe(
        '0x385f64d993f7b77d8182ed5003d97c60aa3361f3cecfe711544d2d59165e9bdf',
      );
    });

    it('POL/USD (replaces MATIC — deprecated 2024)', () => {
      expect(feedIds.PYTH_POL_USD).toBe(
        '0xffd11c5a1cfd42f80afb2df4d9f264c15f956d68153335374ec10722edd70472',
      );
    });

    it('MNT/USD', () => {
      expect(feedIds.PYTH_MNT_USD).toBe(
        '0x4e3037c822d852d79af3ac80e35eb420ee3b870dca49f9344a38ef4773fb0585',
      );
    });

    it('EIGEN/USD', () => {
      expect(feedIds.PYTH_EIGEN_USD).toBe(
        '0xc65db025687356496e8653d0d6608eec64ce2d96e2e28c530e574f0e4f712380',
      );
    });

    it('ETHFI/USD', () => {
      expect(feedIds.PYTH_ETHFI_USD).toBe(
        '0xb27578a9654246cb0a2950842b92330e9ace141c52b63829cc72d5c45a5a595a',
      );
    });

    it('EZETH/USD (Renzo Restaked ETH)', () => {
      expect(feedIds.PYTH_EZETH_USD).toBe(
        '0x06c217a791f5c4f988b36629af4cb88fad827b2485400a358f3b02886b54de92',
      );
    });

    it('PEPE/USD (unscaled, not KPEPE)', () => {
      expect(feedIds.PYTH_PEPE_USD).toBe(
        '0xd69731a2e74ac1ce884fc3890f7ee324b6deb66147055249568869ed700882e4',
      );
    });

    it('WIF/USD', () => {
      expect(feedIds.PYTH_WIF_USD).toBe(
        '0x4ca4beeca86f0d164160323817a4e42b10010a724c2217c6ee41b54cd4cc61fc',
      );
    });

    it('BONK/USD (unscaled, not KBONK)', () => {
      expect(feedIds.PYTH_BONK_USD).toBe(
        '0x72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419',
      );
    });

    it('RENDER/USD (replaces RNDR — renamed post-token-migration)', () => {
      expect(feedIds.PYTH_RENDER_USD).toBe(
        '0x3d4a2bd9535be6ce8059d75eadeba507b043257321aa544717c56fa19b49e35d',
      );
    });

    it('FET/USD (Artificial Superintelligence Alliance)', () => {
      expect(feedIds.PYTH_FET_USD).toBe(
        '0x7da003ada32eabbac855af3d22fcf0fe692cc589f0cfd5ced63cf0bdcc742efe',
      );
    });

    it('GMX/USD', () => {
      expect(feedIds.PYTH_GMX_USD).toBe(
        '0xb962539d0fcb272a494d65ea56f94851c2bcf8823935da05bd628916e2e9edbf',
      );
    });

    it('PENDLE/USD', () => {
      expect(feedIds.PYTH_PENDLE_USD).toBe(
        '0x9a4df90b25497f66b1afb012467e316e801ca3d839456db028892fe8c70c8016',
      );
    });

    it('RDNT/USD', () => {
      expect(feedIds.PYTH_RDNT_USD).toBe(
        '0xc8cf45412be4268bef8f76a8b0d60971c6e57ab57919083b8e9f12ba72adeeb6',
      );
    });

    it('ONDO/USD', () => {
      expect(feedIds.PYTH_ONDO_USD).toBe(
        '0xd40472610abe56d36d065a0cf889fc8f1dd9f3b7f2a478231a5fc6df07ea5ce3',
      );
    });
  });

  describe('Naming rules enforcement', () => {
    it('POL is exported (not MATIC — MATIC deprecated 2024)', () => {
      expect('PYTH_POL_USD' in feedIds).toBe(true);
      expect(feedIds.PYTH_FEED_IDS).toHaveProperty('POL');
    });

    it('MATIC is NOT exported as a separate key (replaced by POL)', () => {
      expect('PYTH_MATIC_USD' in feedIds).toBe(false);
      expect(feedIds.PYTH_FEED_IDS).not.toHaveProperty('MATIC');
    });

    it('RENDER is exported (not RNDR — renamed post-token-migration)', () => {
      expect('PYTH_RENDER_USD' in feedIds).toBe(true);
      expect(feedIds.PYTH_FEED_IDS).toHaveProperty('RENDER');
    });

    it('RNDR is NOT exported as a separate key (replaced by RENDER)', () => {
      expect('PYTH_RNDR_USD' in feedIds).toBe(false);
      expect(feedIds.PYTH_FEED_IDS).not.toHaveProperty('RNDR');
    });

    it('KPEPE is NOT exported (use unscaled PEPE/USD per CLAUDE.md)', () => {
      expect('PYTH_KPEPE_USD' in feedIds).toBe(false);
      expect(feedIds.PYTH_FEED_IDS).not.toHaveProperty('KPEPE');
    });

    it('KBONK is NOT exported (use unscaled BONK/USD per CLAUDE.md)', () => {
      expect('PYTH_KBONK_USD' in feedIds).toBe(false);
      expect(feedIds.PYTH_FEED_IDS).not.toHaveProperty('KBONK');
    });
  });

  describe('TODO_VERIFY stubs', () => {
    it('PYTH_FEED_IDS_TODO_VERIFY lists UNI, LINK, AAVE, MKR, DOGE', () => {
      expect(feedIds.PYTH_FEED_IDS_TODO_VERIFY).toEqual(['UNI', 'LINK', 'AAVE', 'MKR', 'DOGE']);
    });

    it('TODO_VERIFY feeds have placeholder bytes32 (0x000...0) — must be verified before deploy', () => {
      for (const symbol of feedIds.PYTH_FEED_IDS_TODO_VERIFY) {
        const feedId = feedIds.PYTH_FEED_IDS[symbol as keyof typeof feedIds.PYTH_FEED_IDS];
        expect(feedId, `${symbol} TODO_VERIFY should have placeholder 0x000...0`).toBe(
          ZERO_BYTES32,
        );
      }
    });
  });
});
