/**
 * avatar-initial — single source for the avatar fallback initial.
 *
 * quick-260611-5mh C11: truncated wallet addresses were producing a "0"
 * initial (the '0' of '0x') across CallCard, ProfileHeader and the app-side
 * avatar sites. One shared helper instead of divergent inline copies:
 *
 *   - "@veda"            → "V"  (leading @/# stripped, first alpha char)
 *   - "0x7304...5CeD"    → "7"  (first character AFTER the 0x prefix)
 *   - "0xAbC…"           → "A"
 *   - ""                 → "?"
 */
export function avatarInitial(name: string | null | undefined): string {
  const cleaned = (name ?? '').replace(/^[@#]+/, '').trim();
  if (cleaned.length === 0) return '?';

  // Wallet address (full or truncated display alias): skip the 0x prefix.
  if (/^0x/i.test(cleaned)) {
    const afterPrefix = cleaned.slice(2).match(/[a-zA-Z0-9]/)?.[0];
    return (afterPrefix ?? '?').toUpperCase();
  }

  // Real handle: first alphabetic char, falling back to the first character.
  const alpha = cleaned.match(/[a-zA-Z]/)?.[0];
  return (alpha ?? cleaned[0] ?? '?').toUpperCase();
}
