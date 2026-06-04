#!/bin/sh
# Relayer container entrypoint.
#
# Materializes GCP Application Default Credentials from a base64-encoded Fly
# secret (GCP_SA_KEY_B64) so the Google client libraries used at runtime —
# @google-cloud/secret-manager (boot-time secret fetch, D-08) and
# @google-cloud/kms (oracle attestation signing, D-06/D-07) — can authenticate.
#
# Fly only supports env-var secrets, not file secrets, so the JSON key is shipped
# base64-encoded (single line, no quoting/newline hazards) and decoded to a file
# here. GOOGLE_APPLICATION_CREDENTIALS then points the libraries at it.
#
# No-op when GCP_SA_KEY_B64 is unset (local dev, or a future Workload Identity
# Federation path that needs no static key), so this is safe in every environment.
#
# busybox `base64 -d` (node:22-alpine) and a world-writable /tmp under USER node
# are both available in the runner image.
set -e

if [ -n "$GCP_SA_KEY_B64" ]; then
  echo "$GCP_SA_KEY_B64" | base64 -d > /tmp/gcp-sa-key.json
  export GOOGLE_APPLICATION_CREDENTIALS=/tmp/gcp-sa-key.json
fi

# tsconfig rootDir is "." (src/ + lib/ both compiled), so the entry lands at
# dist/src/index.js — NOT dist/index.js.
exec node apps/relayer/dist/src/index.js
