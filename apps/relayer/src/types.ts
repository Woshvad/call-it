/**
 * RelayerEnv — runtime environment interface for the Call It relayer.
 *
 * Sources of truth:
 * - Non-signing secrets: GCP Secret Manager (D-08)
 * - Signing keys: GCP KMS — never in this object (D-06)
 * - Network routing: GCP_PROJECT_ID env var determines which project is accessed (D-09)
 */

export interface RelayerEnv {
  // ── Network ──────────────────────────────────────────────────────────────
  /** 'mainnet' or 'sepolia' */
  NEXT_PUBLIC_NETWORK: 'mainnet' | 'sepolia';
  NEXT_PUBLIC_CHAIN_ID: string;
  NEXT_PUBLIC_SUBGRAPH_URL?: string;
  NEXT_PUBLIC_OG_BASE_URL?: string;
  NEXT_PUBLIC_RELAYER_URL?: string;
  NEXT_PUBLIC_BRAND_FOOTER?: string;

  // ── Runtime ───────────────────────────────────────────────────────────────
  NODE_ENV: string;
  PORT?: string;
  LOG_LEVEL?: string;

  // ── GCP Project (per-network routing, D-09) ───────────────────────────────
  /** 'call-it-sepolia' or 'call-it-mainnet' */
  GCP_PROJECT_ID: string;
  /** KMS keyring region — must be 'us-east1' per Pitfall B */
  GCP_LOCATION_ID: string;
  /** KMS keyring name — 'attestations' */
  GCP_KEYRING_ID: string;

  // ── KMS Key Versions (D-07 — 5 separate keys per attestation type) ────────
  GCP_KEY_VERSION_NFT_TWAP: string;
  GCP_KEY_VERSION_DEFILLAMA: string;
  GCP_KEY_VERSION_CEX: string;
  GCP_KEY_VERSION_SNAPSHOT_TALLY: string;
  GCP_KEY_VERSION_OAUTH_PROOF: string;

  // ── Telegram (D-15 — 2-channel routing) ──────────────────────────────────
  TELEGRAM_BOT_TOKEN: string;
  /** P0 channel (pause, dispute_raised, force_settle, rep_fallback, settle_failed, stylus_reactivation) */
  TELEGRAM_CHAT_ID_P0: string;
  /** P1 channel (paymaster_80, tvl_approach, settle_stuck_25m) */
  TELEGRAM_CHAT_ID_P1: string;

  // ── Upstash Redis (D-03 — BullMQ backing + paymaster counter) ────────────
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;

  // ── Better Stack / Logtail (D-14 — Pino transport) ───────────────────────
  BETTERSTACK_SOURCE_TOKEN: string;

  // ── Other secrets from GCP Secret Manager ─────────────────────────────────
  PRIVY_APP_SECRET: string;
  ALCHEMY_API_KEY: string;
  RPC_URL_ARBITRUM_SEPOLIA?: string;
  RPC_URL_ARBITRUM_MAINNET?: string;
  PINATA_JWT?: string;

  // ── Postgres / Drizzle ORM (D-07 — Fly Postgres, Phase 1) ─────────────────
  /** Fly Postgres connection string — provisioned via `fly postgres create --region iad` */
  POSTGRES_URL: string;

  // ── ENS resolution (D-13 — server-side ENS reverse-record, Phase 1) ─────────
  /** Alchemy Ethereum Mainnet RPC URL (separate key per D-09 per-network IAM isolation) */
  ENS_MAINNET_RPC_URL: string;

  // ── Phase 1 new envs ───────────────────────────────────────────────────────
  NEXT_PUBLIC_PRIVY_APP_ID: string;
  NEXT_PUBLIC_ALCHEMY_AA_POLICY_ID: string;
  NEXT_PUBLIC_RELAYER_BASE_URL: string;
  NEXT_PUBLIC_CALL_REGISTRY_ADDRESS?: string;
  NEXT_PUBLIC_PROFILE_REGISTRY_ADDRESS?: string;
  NEXT_PUBLIC_CIRCLE_PAYMASTER_ADDRESS?: string;
  ALCHEMY_PAYMASTER_ADDRESS?: string;
  PRIVY_WEBHOOK_SECRET: string;

  // ── Internal HMAC for synthetic-event endpoint (D-16) ────────────────────
  RELAYER_INTERNAL_HMAC: string;

  // ── Phase 1.5 — Social linking (CORE wave, D-01..D-09) ───────────────────
  // All optional: CORE links don't require the FEED secrets, and the relayer
  // boots in CI/dev without these. RELAYER_OAUTH_PROOF_ADDRESS is the expected
  // address of the `oauth-proof` KMS key — consumed by the 01.5-02 link service
  // and verified against the on-chain ProfileRegistry.relayer() value.
  /** Expected Ethereum address of the GCP `oauth-proof` KMS signing wallet (Pitfall 1) */
  RELAYER_OAUTH_PROOF_ADDRESS?: string;
  /** Farcaster relay URL for @farcaster/auth-client (default https://relay.farcaster.xyz) */
  FARCASTER_RELAY_URL?: string;
  /** AuthKitProvider domain asserted in verifySignInMessage (Pitfall 3) */
  FARCASTER_AUTH_DOMAIN?: string;

  // ── Phase 1.5 — FEED-wave secrets (01.5-05, gated behind checkpoint) ─────
  /** X API Bearer token (follows.read scope) — "From your X" (AUTH-14/15) */
  X_API_BEARER_TOKEN?: string;
  /** Neynar API key — "From your Farcaster" follow graph (AUTH-18) */
  NEYNAR_API_KEY?: string;

  // ── quick-260611-h36 — settlement-poller signer (OPTIONAL) ────────────────
  /**
   * Hot key for the Redis-free settlement poller's SM.settle transactions.
   * OPTIONAL: absent → the poller runs IDLE (dry-run, single P1 alert, zero
   * transactions). NEVER logged (pino redact), never committed, set by the
   * operator as a Fly secret only (T-h36-01).
   */
  SETTLEMENT_SIGNER_PRIVATE_KEY?: string;
}
