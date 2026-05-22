/**
 * AddressBookManager — address book CRUD UI component (Plan 07, D-07/08/09).
 *
 * Used in Profile → Settings (Plan 09 places it).
 * Provides:
 *   - Table view of active address book entries (address, label, added timestamp, remove button)
 *   - "Add Address" form with Ethereum address validation
 *   - 24h cooldown visualization (shows countdown when an address is in cooldown)
 *   - Optimistic UI updates with error rollback
 *
 * Backend: apps/relayer/src/routes/address-book.ts
 *   - GET /api/addressbook — list active entries
 *   - POST /api/addressbook — add entry
 *   - DELETE /api/addressbook/:id — soft-remove entry
 *
 * Security notes:
 *   - Cooldown countdown is UI-only; the actual 24h enforcement is server-side
 *   - The AddressBookManager shows the countdown to improve UX, not enforce security
 *
 * Requirements: AUTH-31, D-07, D-08, D-09
 */

'use client';

import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { isAddress } from 'viem';

const RELAYER_BASE = (process.env['NEXT_PUBLIC_RELAYER_BASE_URL'] ?? '').replace(/\/$/, '');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AddressBookEntry {
  id: number;
  address: string;
  label: string | null;
  addedAt: string;  // ISO string
  removedAt: string | null;
}

// ─── API helpers ─────────────────────────────────────────────────────────────

async function fetchEntries(token: string): Promise<AddressBookEntry[]> {
  const res = await fetch(`${RELAYER_BASE}/api/addressbook`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch address book: ${res.status}`);
  return res.json() as Promise<AddressBookEntry[]>;
}

async function addEntry(token: string, address: string, label?: string): Promise<AddressBookEntry> {
  const res = await fetch(`${RELAYER_BASE}/api/addressbook`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ address, label }),
  });
  if (!res.ok) {
    const body = await res.json() as { error?: string; message?: string };
    throw new Error(body.message ?? body.error ?? `Failed to add address: ${res.status}`);
  }
  return res.json() as Promise<AddressBookEntry>;
}

async function removeEntry(token: string, id: number): Promise<void> {
  const res = await fetch(`${RELAYER_BASE}/api/addressbook/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to remove address: ${res.status}`);
}

// ─── Countdown helper ─────────────────────────────────────────────────────────

function formatCooldownRemaining(addedAt: string): string {
  const addedAtMs = new Date(addedAt).getTime();
  const cooldownEnds = addedAtMs + 24 * 60 * 60 * 1000;
  const remainingMs = cooldownEnds - Date.now();

  if (remainingMs <= 0) return '';

  const hours = Math.floor(remainingMs / (60 * 60 * 1000));
  const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
  return `${hours}h ${minutes}m`;
}

function isInCooldown(addedAt: string): boolean {
  const addedAtMs = new Date(addedAt).getTime();
  return addedAtMs + 24 * 60 * 60 * 1000 > Date.now();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AddressBookManager() {
  const { ready, authenticated, getAccessToken } = usePrivy();

  const [entries, setEntries] = useState<AddressBookEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add form state
  const [newAddress, setNewAddress] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // Cooldown countdown (re-renders every minute)
  const [_tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Load entries on mount
  useEffect(() => {
    if (!ready || !authenticated) return;
    setIsLoading(true);
    getAccessToken()
      .then(token => {
        if (!token) throw new Error('Not authenticated');
        return fetchEntries(token);
      })
      .then(data => {
        setEntries(data);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load address book');
        setIsLoading(false);
      });
  }, [ready, authenticated, getAccessToken]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    if (!isAddress(newAddress)) {
      setAddError('Invalid Ethereum address');
      return;
    }

    setIsAdding(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      const entry = await addEntry(token, newAddress, newLabel || undefined);
      setEntries(prev => [...prev, entry]);
      setNewAddress('');
      setNewLabel('');
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Failed to add address');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (id: number) => {
    // Optimistic update
    const previous = entries;
    setEntries(prev => prev.filter(e => e.id !== id));

    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      await removeEntry(token, id);
    } catch (err: unknown) {
      // Rollback on error
      setEntries(previous);
      setError(err instanceof Error ? err.message : 'Failed to remove address');
    }
  };

  if (!ready || !authenticated) {
    return (
      <div className="text-sm text-[#666]">
        Sign in to manage your address book.
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="address-book-manager">
      {/* Error banner */}
      {error && (
        <div className="p-3 bg-red-900/30 border border-red-500 rounded text-sm text-red-400">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-300 hover:text-red-100"
          >
            ×
          </button>
        </div>
      )}

      {/* Add Address form */}
      <form onSubmit={(e) => { void handleAdd(e); }} className="space-y-3">
        <h3 className="text-sm font-mono font-bold text-[#E8F542] uppercase tracking-wider">
          Add Address
        </h3>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="0x..."
            value={newAddress}
            onChange={e => setNewAddress(e.target.value)}
            className="flex-1 font-mono text-sm px-3 py-2 bg-[#09090E] border border-[#333] rounded text-white placeholder:text-[#555]"
            aria-label="Ethereum address"
          />
          <input
            type="text"
            placeholder="Label (optional)"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            maxLength={50}
            className="w-40 text-sm px-3 py-2 bg-[#09090E] border border-[#333] rounded text-white placeholder:text-[#555]"
            aria-label="Address label"
          />
          <button
            type="submit"
            disabled={isAdding || !newAddress}
            className="px-4 py-2 bg-[#E8F542] text-[#09090E] font-mono font-bold text-sm rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#d4e01e] transition-colors"
          >
            {isAdding ? '...' : 'Add'}
          </button>
        </div>
        {addError && (
          <p className="text-xs text-red-400">{addError}</p>
        )}
        <p className="text-xs text-[#666]">
          Note: New addresses have a 24h security cooldown before you can withdraw to them.
        </p>
      </form>

      {/* Address book table */}
      <div>
        <h3 className="text-sm font-mono font-bold text-[#E8F542] uppercase tracking-wider mb-3">
          Saved Addresses
        </h3>

        {isLoading && (
          <p className="text-sm text-[#666]">Loading...</p>
        )}

        {!isLoading && entries.length === 0 && (
          <p className="text-sm text-[#666]">No saved addresses yet.</p>
        )}

        {!isLoading && entries.length > 0 && (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-[#666] uppercase tracking-wider">
                <th className="pb-2 pr-4 font-normal">Address</th>
                <th className="pb-2 pr-4 font-normal">Label</th>
                <th className="pb-2 pr-4 font-normal">Added</th>
                <th className="pb-2 font-normal">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#222]">
              {entries.map(entry => {
                const cooldown = isInCooldown(entry.addedAt);
                const remaining = cooldown ? formatCooldownRemaining(entry.addedAt) : '';

                return (
                  <tr key={entry.id} className="py-2">
                    <td className="py-2 pr-4 font-mono text-xs text-[#ccc]">
                      {entry.address.slice(0, 6)}...{entry.address.slice(-4)}
                    </td>
                    <td className="py-2 pr-4 text-[#999]">
                      {entry.label ?? <span className="text-[#555]">—</span>}
                    </td>
                    <td className="py-2 pr-4 text-[#999]">
                      {new Date(entry.addedAt).toLocaleDateString()}
                    </td>
                    <td className="py-2">
                      {cooldown ? (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-900/30 border border-yellow-600/50 rounded text-xs text-yellow-400"
                          data-testid="cooldown-badge"
                        >
                          ⏱ {remaining} remaining
                        </span>
                      ) : (
                        <button
                          onClick={() => { void handleRemove(entry.id); }}
                          className="text-xs text-[#666] hover:text-red-400 transition-colors"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
