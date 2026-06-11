#!/usr/bin/env bash
# SAFETY-21 — continuous 48h soak heartbeat instrument.
# Polls the LIVE relayer + Sepolia recovery cluster every INTERVAL seconds for DURATION,
# appending one JSON line per tick to evidence/phase-6-soak/soak-21-heartbeat-<start>.jsonl.
# Read-only: no gas, no wallet drain. The relayer on Fly is the real system under test;
# this records that it (and the cluster invariants) stay healthy across a continuous window.
#
# Restart (operator): from repo root
#   bash apps/relayer/src/scripts/soak-monitor.sh
# Anomaly = any tick where health!=ok OR owner!=treasury OR engine!=normal (logged alert:true).
set -u

ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
ENVF="$ROOT/apps/relayer/.env.local"
RPC="$(grep -E '^ARBITRUM_SEPOLIA_RPC_URL=' "$ENVF" | sed 's/^[^=]*=//; s/\r$//')"

SM=0x2E26eEb3b4CC9FA49B543846ea2E01B7600897e7
CR=0xc79bB19dBCA44D8b467b9f7bbb191b56e9fb3CB0
OWNER_EXPECT=0xda8c5726f596e8dae99e6ddeba8aea1c8be9a4a5
ENGINE_EXPECT=0xe7e15980c40db52bfc6dcabb21b3d90edfb27c14
HEALTH=https://call-it-relayer-sepolia.fly.dev/health

INTERVAL="${SOAK_INTERVAL_SECONDS:-900}"   # 15 min
DURATION="${SOAK_DURATION_SECONDS:-172800}" # 48h
START=$(date +%s)
END=$((START + DURATION))
OUT="$ROOT/evidence/phase-6-soak/soak-21-heartbeat-${START}.jsonl"

emit() { printf '%s\n' "$1" >> "$OUT"; }
isoz() { date -u +%Y-%m-%dT%H:%M:%SZ; }

emit "{\"event\":\"soak_start\",\"ts\":\"$(isoz)\",\"start_epoch\":$START,\"end_epoch\":$END,\"interval_s\":$INTERVAL,\"duration_s\":$DURATION,\"sm\":\"$SM\",\"cr\":\"$CR\"}"

tick=0
while [ "$(date +%s)" -lt "$END" ]; do
  tick=$((tick+1))
  hraw=$(curl -s --max-time 20 "$HEALTH" 2>/dev/null)
  hstat=$(printf '%s' "$hraw" | grep -oE '"status":"[^"]*"' | head -1 | sed 's/.*://; s/"//g')
  [ -z "$hstat" ] && hstat="UNREACHABLE"
  blk=$(cast block-number --rpc-url "$RPC" 2>/dev/null | awk '{print $1}'); [ -z "$blk" ] && blk="null"
  owner=$(cast call $SM 'owner()(address)' --rpc-url "$RPC" 2>/dev/null | tr 'A-Z' 'a-z')
  engine=$(cast call $SM 'stylusScoreEngine()(address)' --rpc-url "$RPC" 2>/dev/null | tr 'A-Z' 'a-z')
  tvl=$(cast call $CR 'currentTvl()(uint256)' --rpc-url "$RPC" 2>/dev/null | awk '{print $1}'); [ -z "$tvl" ] && tvl="null"
  alert=false
  [ "$hstat" != "ok" ] && alert=true
  [ "$owner" != "$OWNER_EXPECT" ] && alert=true
  [ "$engine" != "$ENGINE_EXPECT" ] && alert=true
  emit "{\"event\":\"tick\",\"n\":$tick,\"ts\":\"$(isoz)\",\"elapsed_h\":$(awk "BEGIN{printf \"%.2f\",($(date +%s)-$START)/3600}"),\"block\":$blk,\"health\":\"$hstat\",\"owner_ok\":$([ "$owner" = "$OWNER_EXPECT" ] && echo true || echo false),\"engine_ok\":$([ "$engine" = "$ENGINE_EXPECT" ] && echo true || echo false),\"tvl\":$tvl,\"alert\":$alert}"
  remaining=$((END - $(date +%s)))
  [ "$remaining" -le 0 ] && break
  [ "$remaining" -lt "$INTERVAL" ] && sleep "$remaining" || sleep "$INTERVAL"
done

alerts=$(grep -c '"alert":true' "$OUT" 2>/dev/null); alerts=$(printf '%s' "$alerts" | head -1); [ -z "$alerts" ] && alerts=0
emit "{\"event\":\"soak_done\",\"ts\":\"$(isoz)\",\"ticks\":$tick,\"alert_count\":$alerts,\"verdict\":\"$([ "$alerts" -eq 0 ] && echo PASS || echo REVIEW)\"}"
