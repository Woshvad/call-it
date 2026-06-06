/**
 * AUTH-06 / Pitfall 2 — Twitter link-proof extraction.
 *
 * Asserts:
 *  - given a mocked getPrivyClient().getUser returning a twitter_oauth linked
 *    account, returns { handle: username, subject }.
 *  - throws 'twitter_not_linked_in_privy' when there is no twitter_oauth account.
 *  - the handle ALWAYS comes from Privy (never a request-body argument — Pitfall 2):
 *    the function signature accepts only the privyUserId.
 *
 * Requirement: AUTH-06. Pitfall 2.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Privy client singleton — getUser returns canned linkedAccounts.
const getUserMock = vi.fn();
vi.mock('../src/lib/privy-auth.js', () => ({
  getPrivyClient: () => ({ getUser: getUserMock }),
}));

import { extractVerifiedTwitter } from '../src/lib/twitter-proof.js';

describe('AUTH-06: extractVerifiedTwitter', () => {
  beforeEach(() => {
    getUserMock.mockReset();
  });

  it('returns the Privy-verified handle + subject from the twitter_oauth account', async () => {
    getUserMock.mockResolvedValue({
      linkedAccounts: [
        { type: 'wallet', address: '0xabc' },
        { type: 'twitter_oauth', username: 'satoshi', subject: 'x-user-12345' },
      ],
    });

    const result = await extractVerifiedTwitter('did:privy:user-1');
    expect(result).toEqual({ handle: 'satoshi', subject: 'x-user-12345' });
    // Pitfall 2: extraction reads Privy by the session privyUserId only.
    expect(getUserMock).toHaveBeenCalledWith('did:privy:user-1');
  });

  it('throws twitter_not_linked_in_privy when no twitter_oauth account exists', async () => {
    getUserMock.mockResolvedValue({
      linkedAccounts: [{ type: 'wallet', address: '0xabc' }],
    });
    await expect(extractVerifiedTwitter('did:privy:user-2')).rejects.toThrow(
      'twitter_not_linked_in_privy',
    );
  });

  it('throws twitter_not_linked_in_privy when the twitter_oauth account has no username', async () => {
    getUserMock.mockResolvedValue({
      linkedAccounts: [{ type: 'twitter_oauth', username: null, subject: 'x-user-9' }],
    });
    await expect(extractVerifiedTwitter('did:privy:user-3')).rejects.toThrow(
      'twitter_not_linked_in_privy',
    );
  });

  it('throws when linkedAccounts is absent entirely', async () => {
    getUserMock.mockResolvedValue({});
    await expect(extractVerifiedTwitter('did:privy:user-4')).rejects.toThrow(
      'twitter_not_linked_in_privy',
    );
  });

  it('takes only a privyUserId — never a body-supplied handle (Pitfall 2)', () => {
    // The function's arity is 1: the handle cannot be injected from the request body.
    expect(extractVerifiedTwitter.length).toBe(1);
  });
});
