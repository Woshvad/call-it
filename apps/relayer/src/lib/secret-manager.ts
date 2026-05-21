/**
 * GCP Secret Manager client — boot-time secrets fetch (D-08).
 *
 * Per-network routing: GCP_PROJECT_ID env var determines which GCP project
 * is accessed. 'call-it-sepolia' and 'call-it-mainnet' are separate projects
 * with separate IAM bindings (D-09).
 *
 * Local dev fallback: when NODE_ENV !== 'production', missing secrets fall back
 * to process.env[name]. This allows .env.local for offline development without
 * requiring GCP credentials.
 *
 * Security: this module NEVER logs secret values. All errors are sanitized
 * before logging.
 */

import type { RelayerEnv } from '../types.js';

// Lazy import to allow mocking in tests
async function getSecretManagerClient() {
  const { SecretManagerServiceClient } = await import('@google-cloud/secret-manager');
  return new SecretManagerServiceClient();
}

/**
 * Fetch a single secret from GCP Secret Manager.
 * Falls back to process.env[name] in non-production environments.
 */
async function getSecret(
  client: Awaited<ReturnType<typeof getSecretManagerClient>>,
  projectId: string,
  name: string,
): Promise<string | undefined> {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    // Local dev: use process.env directly (populated from .env.local via tsx)
    const envVal = process.env[name];
    if (envVal !== undefined && envVal !== '') {
      return envVal;
    }
  }

  try {
    const secretName = `projects/${projectId}/secrets/${name}/versions/latest`;
    const [version] = await client.accessSecretVersion({ name: secretName });
    const payload = version.payload?.data;
    if (!payload) return undefined;
    return typeof payload === 'string' ? payload : Buffer.from(payload).toString('utf8');
  } catch (_err) {
    if (!isProduction) {
      // In dev, silently fall through to undefined — caller handles missing
      return process.env[name];
    }
    // In production, re-throw so boot fails fast on missing required secrets
    throw new Error(`Failed to fetch secret '${name}' from GCP Secret Manager`);
  }
}

/**
 * Load all relayer secrets from GCP Secret Manager at boot time.
 *
 * Called once from index.ts → initEnv(). The returned object is stored in
 * the module-level `env` variable in env.ts.
 *
 * Throws on missing required secrets in production.
 * In local dev, falls back to process.env for each secret.
 */
export async function loadSecrets(): Promise<RelayerEnv> {
  const projectId = process.env.GCP_PROJECT_ID;
  if (!projectId && process.env.NODE_ENV === 'production') {
    throw new Error('GCP_PROJECT_ID is required in production');
  }

  const effectiveProjectId = projectId ?? 'local-dev';
  const isProduction = process.env.NODE_ENV === 'production';

  // In local dev without GCP_PROJECT_ID, use a no-op client
  const client = (projectId && isProduction) || (projectId && projectId !== 'local-dev')
    ? await getSecretManagerClient()
    : null;

  async function fetchSecret(name: string): Promise<string | undefined> {
    if (client) {
      return getSecret(client, effectiveProjectId, name);
    }
    // No GCP client: use process.env only (local dev)
    return process.env[name];
  }

  async function requireSecret(name: string): Promise<string> {
    const val = await fetchSecret(name);
    if (!val) {
      if (isProduction) {
        throw new Error(`Required secret '${name}' is missing`);
      }
      // In dev, return a placeholder so the app can boot without all secrets
      return `DEV_PLACEHOLDER_${name}`;
    }
    return val;
  }

  // Required secrets
  const [
    telegramBotToken,
    telegramChatIdP0,
    telegramChatIdP1,
    upstashRedisRestUrl,
    upstashRedisRestToken,
    betterStackSourceToken,
    privyAppSecret,
    alchemyApiKey,
    relayerInternalHmac,
  ] = await Promise.all([
    requireSecret('TELEGRAM_BOT_TOKEN'),
    requireSecret('TELEGRAM_CHAT_ID_P0'),
    requireSecret('TELEGRAM_CHAT_ID_P1'),
    requireSecret('UPSTASH_REDIS_REST_URL'),
    requireSecret('UPSTASH_REDIS_REST_TOKEN'),
    requireSecret('BETTERSTACK_SOURCE_TOKEN'),
    requireSecret('PRIVY_APP_SECRET'),
    requireSecret('ALCHEMY_API_KEY'),
    requireSecret('RELAYER_INTERNAL_HMAC'),
  ]);

  // Optional secrets
  const [
    rpcUrlSepolia,
    rpcUrlMainnet,
    pinataJwt,
    subgraphUrl,
    ogBaseUrl,
    relayerUrl,
    brandFooter,
  ] = await Promise.all([
    fetchSecret('RPC_URL_ARBITRUM_SEPOLIA'),
    fetchSecret('RPC_URL_ARBITRUM_MAINNET'),
    fetchSecret('PINATA_JWT'),
    fetchSecret('NEXT_PUBLIC_SUBGRAPH_URL'),
    fetchSecret('NEXT_PUBLIC_OG_BASE_URL'),
    fetchSecret('NEXT_PUBLIC_RELAYER_URL'),
    fetchSecret('NEXT_PUBLIC_BRAND_FOOTER'),
  ]);

  // Build the env object from process.env for non-secret fields + fetched secrets
  const network = (process.env.NEXT_PUBLIC_NETWORK ?? 'sepolia') as 'mainnet' | 'sepolia';
  const chainId = process.env.NEXT_PUBLIC_CHAIN_ID ?? (network === 'mainnet' ? '42161' : '421614');

  return {
    // Network
    NEXT_PUBLIC_NETWORK: network,
    NEXT_PUBLIC_CHAIN_ID: chainId,
    NEXT_PUBLIC_SUBGRAPH_URL: subgraphUrl,
    NEXT_PUBLIC_OG_BASE_URL: ogBaseUrl,
    NEXT_PUBLIC_RELAYER_URL: relayerUrl,
    NEXT_PUBLIC_BRAND_FOOTER: brandFooter,

    // Runtime
    NODE_ENV: process.env.NODE_ENV ?? 'development',
    PORT: process.env.PORT,
    LOG_LEVEL: process.env.LOG_LEVEL,

    // GCP (D-09)
    GCP_PROJECT_ID: effectiveProjectId,
    GCP_LOCATION_ID: process.env.GCP_LOCATION_ID ?? 'us-east1',
    GCP_KEYRING_ID: process.env.GCP_KEYRING_ID ?? 'attestations',

    // KMS key versions (D-07)
    GCP_KEY_VERSION_NFT_TWAP: process.env.GCP_KEY_VERSION_NFT_TWAP ?? '1',
    GCP_KEY_VERSION_DEFILLAMA: process.env.GCP_KEY_VERSION_DEFILLAMA ?? '1',
    GCP_KEY_VERSION_CEX: process.env.GCP_KEY_VERSION_CEX ?? '1',
    GCP_KEY_VERSION_SNAPSHOT_TALLY: process.env.GCP_KEY_VERSION_SNAPSHOT_TALLY ?? '1',
    GCP_KEY_VERSION_OAUTH_PROOF: process.env.GCP_KEY_VERSION_OAUTH_PROOF ?? '1',

    // Telegram (D-15)
    TELEGRAM_BOT_TOKEN: telegramBotToken,
    TELEGRAM_CHAT_ID_P0: telegramChatIdP0,
    TELEGRAM_CHAT_ID_P1: telegramChatIdP1,

    // Upstash Redis (D-03)
    UPSTASH_REDIS_REST_URL: upstashRedisRestUrl,
    UPSTASH_REDIS_REST_TOKEN: upstashRedisRestToken,

    // Better Stack (D-14)
    BETTERSTACK_SOURCE_TOKEN: betterStackSourceToken,

    // Other secrets
    PRIVY_APP_SECRET: privyAppSecret,
    ALCHEMY_API_KEY: alchemyApiKey,
    RPC_URL_ARBITRUM_SEPOLIA: rpcUrlSepolia,
    RPC_URL_ARBITRUM_MAINNET: rpcUrlMainnet,
    PINATA_JWT: pinataJwt,

    // Internal HMAC (D-16)
    RELAYER_INTERNAL_HMAC: relayerInternalHmac,
  };
}
