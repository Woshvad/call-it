/**
 * PostCSS configuration for @call-it/web.
 *
 * This file is MANDATORY. Next.js 16.2.6 does NOT inject the `tailwindcss`
 * plugin into its default PostCSS plugin set — when no postcss.config is
 * found it falls back to only `postcss-flexbugs-fixes` + `postcss-preset-env`.
 * Without this config the `@tailwind base/components/utilities` directives in
 * app/globals.css are passed through uncompiled and emit ZERO utilities.
 *
 * Tailwind v3 wiring (this repo pins tailwindcss@3.4.x): register the
 * `tailwindcss` plugin then `autoprefixer`. Do NOT use `@tailwindcss/postcss`
 * (that is the Tailwind v4 plugin). Export a plain object — Next rejects a
 * function-exported PostCSS config (error E323).
 */
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
