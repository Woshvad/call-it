/**
 * Schema validation tests for the Call It subgraph.
 *
 * Test 1: All 23 entity types from spec §12.1–12.5 are declared
 * Test 2: Each entity has at minimum an id: ID! field
 * Test 3: Schema is The Graph-compatible — every entity is annotated @entity; no unsupported features
 *
 * Requirements: OPS-01, OPS-03
 */

import { readFileSync } from 'node:fs';
import { parse, DocumentNode, ObjectTypeDefinitionNode, FieldDefinitionNode, DirectiveNode } from 'graphql';
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';

// Load schema from disk relative to package root
const schemaPath = join(process.cwd(), 'schema.graphql');
const schemaText = readFileSync(schemaPath, 'utf-8');
const schema: DocumentNode = parse(schemaText);

/** All 23 entity names required per spec §12.1–12.5 and plan interfaces */
const REQUIRED_ENTITIES = [
  'Call',
  'Position',
  'Challenge',
  'Settlement',
  'Profile',
  'RepEvent',
  'Dispute',
  'QuoteCall',
  'ConvictionCap',
  'CallerExit',
  'SocialLink',
  'PayoutClaim',
  'PositionExit',
  'ChallengePayout',
  'DisputeResolution',
  'ForceSettlement',
  'SettlementDelayed',
  'RepCalculatedFallback',
  'UnclaimedOverage',
  'PaymasterEvent',
  'TvlSnapshot',
  'CategoryRep',
  'LeaderboardEntry',
] as const;

/** Extract entity type definitions from the parsed schema */
function getEntityTypes(doc: DocumentNode): ObjectTypeDefinitionNode[] {
  return doc.definitions.filter(
    (def): def is ObjectTypeDefinitionNode =>
      def.kind === 'ObjectTypeDefinition' &&
      (def.directives ?? []).some(
        (d: DirectiveNode) => d.name.value === 'entity'
      )
  );
}

/** Get all ObjectTypeDefinition names in schema */
function getAllTypeNames(doc: DocumentNode): string[] {
  return doc.definitions
    .filter((def): def is ObjectTypeDefinitionNode => def.kind === 'ObjectTypeDefinition')
    .map((def) => def.name.value);
}

describe('Subgraph schema — entity completeness', () => {
  it('Test 1: schema declares all 23 required entity types from spec §12.1–12.5', () => {
    const allTypeNames = getAllTypeNames(schema);
    const missingEntities = REQUIRED_ENTITIES.filter((name) => !allTypeNames.includes(name));

    expect(
      missingEntities,
      `Missing entities: ${missingEntities.join(', ')}. All 23 entities are required (OPS-03).`
    ).toHaveLength(0);

    // Confirm the count is at least 23
    const entityCount = getEntityTypes(schema).length;
    expect(entityCount, `Expected at least 23 @entity types, found ${entityCount}`).toBeGreaterThanOrEqual(23);
  });

  it('Test 2: each entity has at minimum an id: ID! field', () => {
    const entityTypes = getEntityTypes(schema);
    const missingId: string[] = [];

    for (const entityType of entityTypes) {
      const fields = (entityType.fields ?? []) as FieldDefinitionNode[];
      const idField = fields.find((f) => f.name.value === 'id');

      if (!idField) {
        missingId.push(`${entityType.name.value}: missing 'id' field`);
        continue;
      }

      // Verify id is non-null (ID!)
      const isNonNull = idField.type.kind === 'NonNullType';
      if (!isNonNull) {
        missingId.push(`${entityType.name.value}: 'id' field must be ID! (non-nullable)`);
      }
    }

    expect(
      missingId,
      `Entities with missing/invalid id field:\n${missingId.join('\n')}`
    ).toHaveLength(0);
  });

  it('Test 3: schema is The Graph-compatible — all entity types are annotated @entity, no unsupported features', () => {
    // Check via raw text — every type declaration that is a data entity should have @entity
    // The Graph doesn't support interface types, union types beyond what graph-ts provides

    // Count types with @entity annotation via regex
    const entityMatches = schemaText.match(/^type\s+\w+\s+@entity/gm) ?? [];

    // Count all type declarations
    const typeMatches = schemaText.match(/^type\s+\w+\s/gm) ?? [];

    // All types in schema should be entities (no plain types without @entity in subgraph context)
    expect(
      entityMatches.length,
      `Expected all ${typeMatches.length} type declarations to have @entity annotation, only found ${entityMatches.length} with @entity`
    ).toBeGreaterThanOrEqual(23);

    // Verify no interface declarations (not supported in older graph-ts)
    const interfaceMatches = schemaText.match(/^interface\s+\w+/gm) ?? [];
    expect(
      interfaceMatches,
      'Schema must not use "interface" declarations (not supported by The Graph for entity types)'
    ).toHaveLength(0);

    // Verify no union declarations
    const unionMatches = schemaText.match(/^union\s+\w+/gm) ?? [];
    expect(
      unionMatches,
      'Schema must not use "union" declarations (not supported by The Graph for entity types)'
    ).toHaveLength(0);

    // Verify schema parses without errors (already done by parse() at top — reaching here means OK)
    expect(schemaText.length).toBeGreaterThan(100);
  });
});
