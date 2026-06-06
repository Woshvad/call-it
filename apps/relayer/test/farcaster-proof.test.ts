/**
 * AUTH-07 / Pitfall 3 — Farcaster SIWF link-proof verification.
 *
 * Asserts:
 *  - given a mocked verifySignInMessage returning { success: true, fid }, returns { fid }.
 *  - throws 'siwf_verification_failed' when success:false.
 *  - throws 'siwf_missing_nonce_or_domain' when the nonce or domain is empty
 *    (Pitfall 3 — both must be provided or anti-replay is defeated; the verifier
 *    must not even be called in that case).
 *
 * Requirement: AUTH-07. Pitfall 3.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @farcaster/auth-client — createAppClient().verifySignInMessage is canned.
const verifySignInMessageMock = vi.fn();
vi.mock('@farcaster/auth-client', () => ({
  createAppClient: () => ({ verifySignInMessage: verifySignInMessageMock }),
  viemConnector: () => ({}),
}));

import { verifyFarcasterProof } from '../src/lib/farcaster-proof.js';

const VALID = {
  nonce: 'server-issued-nonce-abc',
  domain: 'callit.example',
  message: 'callit.example wants you to sign in...',
  signature: ('0x' + '11'.repeat(65)) as `0x${string}`,
};

describe('AUTH-07: verifyFarcasterProof', () => {
  beforeEach(() => {
    verifySignInMessageMock.mockReset();
  });

  it('returns { fid } on a successful verify', async () => {
    verifySignInMessageMock.mockResolvedValue({ success: true, fid: 6789, data: {} });
    const result = await verifyFarcasterProof(VALID);
    expect(result).toEqual({ fid: 6789 });
    // Pitfall 3: the server-issued nonce + domain are passed through to the verifier.
    expect(verifySignInMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ nonce: VALID.nonce, domain: VALID.domain }),
    );
  });

  it('throws siwf_verification_failed when success:false', async () => {
    verifySignInMessageMock.mockResolvedValue({ success: false });
    await expect(verifyFarcasterProof(VALID)).rejects.toThrow('siwf_verification_failed');
  });

  it('throws siwf_missing_nonce_or_domain when nonce is empty (Pitfall 3)', async () => {
    await expect(verifyFarcasterProof({ ...VALID, nonce: '' })).rejects.toThrow(
      'siwf_missing_nonce_or_domain',
    );
    // Verifier must NOT run when the nonce is missing.
    expect(verifySignInMessageMock).not.toHaveBeenCalled();
  });

  it('throws siwf_missing_nonce_or_domain when domain is empty (Pitfall 3)', async () => {
    await expect(verifyFarcasterProof({ ...VALID, domain: '' })).rejects.toThrow(
      'siwf_missing_nonce_or_domain',
    );
    expect(verifySignInMessageMock).not.toHaveBeenCalled();
  });

  it('throws siwf_missing_nonce_or_domain when both are whitespace (Pitfall 3)', async () => {
    await expect(verifyFarcasterProof({ ...VALID, nonce: '  ', domain: '   ' })).rejects.toThrow(
      'siwf_missing_nonce_or_domain',
    );
    expect(verifySignInMessageMock).not.toHaveBeenCalled();
  });
});
