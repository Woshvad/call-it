/**
 * OG image font loader — loaded ONCE at module init time, NOT inside the GET handler.
 *
 * Pitfall F mitigation: fonts must live in app/fonts/ NOT public/fonts/ for the
 * Vercel bundler to include them in the server bundle. The path is resolved relative
 * to the package root using process.cwd() (Next.js server-side).
 *
 * The module-level readFileSync calls run at cold-start and are amortized across
 * all subsequent renders. This keeps warm render times under 100ms (SHARE-11).
 *
 * Font licenses: SIL Open Font License 1.1 (see apps/web/app/fonts/LICENSE.txt)
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Load a font file at module init time.
 * Throws a descriptive error if the file is missing — so Vercel cold-start fails
 * loudly instead of silently falling back to a wrong/missing font.
 */
function loadFont(filename: string): Buffer {
  const fontPath = join(process.cwd(), 'app', 'fonts', filename);
  try {
    return readFileSync(fontPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[og-fonts] Failed to load font "${filename}" from "${fontPath}". ` +
      `Fonts must be committed to apps/web/app/fonts/ (NOT public/fonts/) ` +
      `for the Vercel bundler to include them. Original error: ${message}`
    );
  }
}

/** Syne Bold 700 — used for the CALL IT wordmark (48px) and hero text (64px) */
export const syneBold: Buffer = loadFont('Syne-Bold.ttf');

/** Space Grotesk Regular 400 — used for handle, subtext, footer brand (14–28px) */
export const spaceGrotesk: Buffer = loadFont('SpaceGrotesk-Regular.ttf');

/** JetBrains Mono Regular 400 — used for the ARBITRUM label (12px) */
export const jetBrainsMono: Buffer = loadFont('JetBrainsMono-Regular.ttf');
