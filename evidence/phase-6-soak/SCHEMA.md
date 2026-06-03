# Evidence Log Schema — Phase 6 Soak

## Purpose

Maps every SAFETY-21–28 requirement and PITFALLS checklist item to Arbitrum Sepolia
tx hashes produced by the `soak-seeder.ts` script during the ≥48h live soak.
Each `EvidenceEntry` in the JSONL log is independently verifiable on Arbiscan.

## EvidenceEntry Schema

```typescript
interface EvidenceEntry {
  // The soak action that produced this evidence.
  action:
    | 'callCreated'          // SAFETY-21: ≥10 calls covering all market types
    | 'followed'             // SAFETY-22: ≥30 follow/fade positions
    | 'faded'                // SAFETY-22: ≥30 follow/fade positions
    | 'settled'              // SAFETY-23: ≥3 settles per type
    | 'callerExited'         // SAFETY-24: ≥1 caller-exit flow
    | 'challengeProposed'    // SAFETY-25: challenge cycle
    | 'challengeAccepted'    // SAFETY-25: challenge cycle
    | 'challengeSettled'     // SAFETY-25: challenge cycle complete
    | 'disputeRaised'        // SAFETY-26: owner-resolved dispute
    | 'disputeResolved'      // SAFETY-26: owner-resolved dispute
    | 'settlementDelayed';   // SAFETY-27/28: Pyth confidence-retry / SettlementDelayed

  // Arbitrum Sepolia tx hash — verify on https://sepolia.arbiscan.io/tx/<txHash>
  txHash: `0x${string}`;

  // On-chain callId from CallCreated event (present for most actions)
  callId?: number;

  // Index into the SOAK_WALLET_0..SOAK_WALLET_9 array that signed this tx
  walletIndex?: number;

  // Unix timestamp (ms) when this entry was written
  timestamp: number;

  // Arbitrum Sepolia block number containing this tx
  block?: number;
}
```

## Log Files

Each seeder run creates `evidence-${Date.now()}.jsonl` in this directory.
Format: one JSON object per line (JSONL / newline-delimited JSON).

## Requirement Coverage

| Requirement  | Action(s)                                         |
|-------------|---------------------------------------------------|
| SAFETY-21   | callCreated (≥10, all market types)               |
| SAFETY-22   | followed, faded (≥30 combined, ≥15 each)         |
| SAFETY-23   | settled (≥3 per market type)                      |
| SAFETY-24   | callerExited (≥1)                                 |
| SAFETY-25   | challengeProposed, challengeAccepted, challengeSettled |
| SAFETY-26   | disputeRaised, disputeResolved                    |
| SAFETY-27   | settlementDelayed (Pyth confidence-retry detected)|
| SAFETY-28   | settlementDelayed (SettlementDelayed event emitted)|
