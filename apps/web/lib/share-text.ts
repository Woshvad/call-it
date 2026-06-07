/**
 * share-text.ts — web re-export of the pure share-intent builders.
 *
 * SHARE-15 (Twitter intent) / SHARE-18 (Warpcast cast) — D-02.
 *
 * SINGLE SOURCE (07-04 Rule-3 relocation): the canonical pure builders now live in
 * `@call-it/shared` (packages/shared/src/share/share-text.ts) so the relayer
 * auto-post worker (Plan 07-04) imports the exact same logic that the web Share
 * button (Plan 07-05) uses — the relayer cannot import across the apps/web project
 * boundary, so the shared package is the only correct common home. This module is a
 * thin re-export to preserve every existing `../lib/share-text.js` import in web.
 *
 * PURITY CONTRACT (T-07-01-02): the builders stay pure — no environment reads, no
 * network calls, no secrets. The X write token lives ONLY in the relayer; it never
 * passes through this module.
 */

export {
  twitterIntentUrl,
  warpcastComposeUrl,
  buildShareText,
  type ShareTextInput,
} from '@call-it/shared';
