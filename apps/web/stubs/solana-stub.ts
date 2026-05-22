/**
 * Solana package stub — Call It is Arbitrum-only (OPS-21).
 *
 * @privy-io/react-auth@3.27.0 bundles optional Solana wallet components that import
 * @solana/kit and @solana-program/* at build time. Since we never use Solana wallets,
 * we stub these packages to prevent build failures.
 *
 * [Rule 3 - Blocking]: @solana-program/system@0.12 is incompatible with @solana/kit@5.5.1
 * (SOLANA_ERROR__PROGRAM_CLIENTS__UNRECOGNIZED_INSTRUCTION_TYPE missing from kit@5.5.1).
 * The alias in next.config.ts (webpack + turbopack) routes all Solana imports here.
 *
 * This stub exports a Proxy that returns no-op functions/undefined for any accessed property.
 * This is safe because Privy's Solana components are never rendered in this app.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const noop = () => undefined as any;

// Proxy handler that returns a no-op function for any property access
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handler: ProxyHandler<any> = {
  get: () => new Proxy(noop, handler),
  apply: () => undefined,
  construct: () => new Proxy({}, handler),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stub: any = new Proxy({}, handler);

export default stub;
export const createSystemProgram = noop;
export const getTransferSolInstruction = noop;
export const getMemoInstruction = noop;
export const getTransferInstruction = noop;
