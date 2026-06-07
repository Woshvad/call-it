/**
 * call-statement.test.ts — RED scaffold (SC3 / D-05) for the subgraph
 * Call.statement templated-default mapping.
 *
 * This is the Wave-0 scaffold Plan 07-02 turns GREEN. It enumerates the
 * templated-default behavior as `it.todo` placeholders so the file + behavior map
 * exist now (Nyquist compliance) without failing the subgraph suite. Plan 07-02 will:
 *   1. Add a `statement: String` field to the Call entity (schema.graphql, D-03) —
 *      distinct from the existing `reasoning` field to avoid semantic overload.
 *   2. Set a SAFE templated default in the CallCreated mapping so the OG/receipt
 *      never crash when relayer enrichment has not yet run (UI-SPEC error-state row).
 *   3. Replace each `it.todo` below with a real assertion against the mapping.
 *
 * DO NOT delete or weaken these todos — they are the verification map referenced in
 * 07-VALIDATION.md for SC3 / D-05.
 *
 * Requirements: OPS-01, OPS-03 (subgraph), SHARE family (receipt prose).
 */

import { describe, it } from 'vitest';

describe('SC3 / D-05: Call.statement templated default (Plan 07-02 turns this GREEN)', () => {
  it.todo(
    'the Call entity exposes a `statement: String` field distinct from `reasoning` (D-03)',
  );
  it.todo(
    'the CallCreated mapping sets a templated default statement when no enrichment is present (e.g. a market-type/asset/target template) — never null on the OG hot path',
  );
  it.todo(
    'a later relayer enrichment write overrides the templated default with the real human-readable market statement',
  );
  it.todo(
    'the templated default is deterministic for a given (marketType, asset, target, expiry) so receipts are stable before enrichment lands',
  );
});
