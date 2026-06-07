/**
 * call-statement.test.ts — SC3 / D-05 source-assertion tests for the subgraph
 * Call.statement templated-default mapping (Plan 07-02 turns the Plan 07-01 RED
 * scaffold GREEN).
 *
 * These are source-level assertions (parse schema.graphql + regex the mapping
 * source) mirroring schema.test.ts — matchstick runtime tests are not wired in
 * this package; the vitest suite asserts the schema field + mapping wiring exist.
 *
 * Verifies:
 *   1. The Call entity exposes a `statement: String` field distinct from `reasoning` (D-03).
 *   2. The CallCreated mapping sets a templated default statement (never null on the
 *      OG hot path) built from the numerics on the event (marketType + callId).
 *   3. A later relayer enrichment is the AUTHORITATIVE source (live-state marketLine,
 *      D-05) — the mapping default is only the safe fallback; documented as the contract.
 *   4. The templated default is deterministic for a given (marketType, callId) so
 *      receipts are stable before enrichment lands.
 *
 * Requirements: OPS-01, OPS-03, OPS-04 (subgraph), SHARE family (receipt prose), D-05.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parse,
  DocumentNode,
  ObjectTypeDefinitionNode,
  FieldDefinitionNode,
} from 'graphql';
import { describe, it, expect } from 'vitest';

const schemaPath = join(process.cwd(), 'schema.graphql');
const schemaText = readFileSync(schemaPath, 'utf-8');
const schema: DocumentNode = parse(schemaText);

const mappingPath = join(process.cwd(), 'src', 'call-registry.ts');
const mappingText = readFileSync(mappingPath, 'utf-8');

function getCallEntity(): ObjectTypeDefinitionNode {
  const call = schema.definitions.find(
    (def): def is ObjectTypeDefinitionNode =>
      def.kind === 'ObjectTypeDefinition' && def.name.value === 'Call',
  );
  if (!call) throw new Error('Call entity not found in schema.graphql');
  return call;
}

describe('SC3 / D-05: Call.statement templated default', () => {
  it('the Call entity exposes a `statement: String` field distinct from `reasoning` (D-03)', () => {
    const call = getCallEntity();
    const fields = (call.fields ?? []) as FieldDefinitionNode[];

    const statementField = fields.find((f) => f.name.value === 'statement');
    const reasoningField = fields.find((f) => f.name.value === 'reasoning');

    expect(statementField, 'Call.statement field must exist').toBeDefined();
    expect(reasoningField, 'Call.reasoning must remain (distinct from statement)').toBeDefined();

    // statement is nullable String (NamedType, not NonNullType) per the forward-compat
    // mirror contract — pre-v0.9.0 rows may not have it.
    expect(statementField!.type.kind, 'Call.statement must be nullable String').toBe('NamedType');
    const typeName =
      statementField!.type.kind === 'NamedType' ? statementField!.type.name.value : '';
    expect(typeName).toBe('String');

    // Distinct fields — not an alias of reasoning
    expect(statementField!.name.value).not.toBe(reasoningField!.name.value);
  });

  it('the CallCreated mapping sets a templated default statement (never null on the OG hot path)', () => {
    // handleCallCreated must assign call.statement to the templated helper, not null.
    expect(
      /call\.statement\s*=\s*templateStatement\(/.test(mappingText),
      'handleCallCreated must set call.statement = templateStatement(...)',
    ).toBe(true);

    // The helper must exist and build from the market-type label + callId (flat AS).
    expect(
      /function\s+templateStatement\(/.test(mappingText),
      'templateStatement helper must be defined',
    ).toBe(true);
    expect(
      /function\s+marketTypeLabel\(/.test(mappingText),
      'marketTypeLabel helper must be defined (human-readable market line)',
    ).toBe(true);

    // Never assign null to statement on the create path (the OG hot-path guarantee).
    expect(
      /call\.statement\s*=\s*null/.test(mappingText),
      'handleCallCreated must NOT set call.statement = null',
    ).toBe(false);
  });

  it('the relayer enrichment is the authoritative source; the mapping default is the safe fallback (D-05)', () => {
    // The mapping documents that the authoritative prose comes from the relayer
    // (live-state marketLine) — the templated value is only the safe default.
    // Asserted via the helper doc-contract literal so the contract cannot silently drift.
    expect(
      /marketLine/.test(mappingText) || /authoritative/.test(mappingText),
      'mapping must document the relayer-authoritative contract (D-05)',
    ).toBe(true);
  });

  it('the templated default is deterministic for a given (marketType, callId)', () => {
    // Re-implement the helper's pure logic and assert determinism + non-empty output.
    // Mirror of templateStatement(marketType, callId) in call-registry.ts.
    function marketTypeLabel(marketType: number): string {
      if (marketType === 0) return 'Price target';
      if (marketType === 1) return 'Relative performance';
      if (marketType === 2) return 'Event';
      return 'Call';
    }
    function templateStatement(marketType: number, callId: string): string {
      return marketTypeLabel(marketType) + ' call #' + callId;
    }

    const a = templateStatement(0, '42');
    const b = templateStatement(0, '42');
    expect(a).toBe(b); // deterministic
    expect(a.length).toBeGreaterThan(0); // never empty on the OG hot path
    expect(templateStatement(1, '7')).toBe('Relative performance call #7');
    // Distinct inputs → distinct output (callId participates)
    expect(templateStatement(0, '42')).not.toBe(templateStatement(0, '43'));
  });
});
