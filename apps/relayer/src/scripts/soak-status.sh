#!/usr/bin/env bash
# SAFETY-21 soak status — read-only, no gas. Run anytime from repo root:
#   bash apps/relayer/src/scripts/soak-status.sh
# Tells you whether the 48h continuous-uptime clock is still intact, or was reset by a restart.
set -u

ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
ENVF="$ROOT/apps/relayer/.env.local"
RPC="$(grep -E '^ARBITRUM_SEPOLIA_RPC_URL=' "$ENVF" | sed 's/^[^=]*=//; s/\r$//')"

APP=call-it-relayer-sepolia
MACHINE=83629da7359938
SM=0x2E26eEb3b4CC9FA49B543846ea2E01B7600897e7
OWNER_EXPECT=0xda8c5726f596e8dae99e6ddeba8aea1c8be9a4a5
ENGINE_EXPECT=0xe7e15980c40db52bfc6dcabb21b3d90edfb27c14
START_EXPECT="2026-06-08T08:45:41Z"   # current window start (last relayer 'started' event)
HEALTH=https://call-it-relayer-sepolia.fly.dev/health

now=$(date -u +%s)
start=$(date -u -d "$START_EXPECT" +%s 2>/dev/null)
end=$((start + 172800))
elapsed_h=$(awk "BEGIN{printf \"%.1f\",($now-$start)/3600}")
remain_h=$(awk "BEGIN{r=($end-$now)/3600; printf \"%.1f\",(r<0?0:r)}")
target=$(date -u -d "@$end" +%Y-%m-%dT%H:%MZ 2>/dev/null)

# Has the relayer restarted since the window started? Read its latest 'started' event.
fly_started=$(flyctl machine status $MACHINE -a $APP 2>/dev/null \
  | sed 's/\x1b\[[0-9;]*m//g' \
  | grep -i 'start' \
  | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+Z-]+' | head -1)

health=$(curl -s --max-time 15 "$HEALTH" 2>/dev/null | grep -oE '"status":"[^"]*"' | head -1 | sed 's/.*://; s/"//g')
[ -z "$health" ] && health="UNREACHABLE"
owner=$(cast call $SM 'owner()(address)' --rpc-url "$RPC" 2>/dev/null | tr 'A-Z' 'a-z')
engine=$(cast call $SM 'stylusScoreEngine()(address)' --rpc-url "$RPC" 2>/dev/null | tr 'A-Z' 'a-z')

echo "================ SAFETY-21 SOAK STATUS ================"
echo " window start : $START_EXPECT"
echo " 48h target   : $target"
echo " elapsed      : ${elapsed_h}h    remaining: ${remain_h}h"
echo " relayer health: $health"
echo " fly last start: ${fly_started:-<could not read>}"
echo " owner ok     : $([ "$owner"  = "$OWNER_EXPECT"  ] && echo YES || echo "NO ($owner)")"
echo " engine ok    : $([ "$engine" = "$ENGINE_EXPECT" ] && echo YES || echo "NO ($engine)")"
echo "------------------------------------------------------"
reset=0
case "$fly_started" in
  2026-06-08T08:45*|2026-06-08T09:45*) ;;            # expected (UTC or +01:00 local render)
  "") echo " ?? could not read Fly machine — check manually: flyctl machine status $MACHINE -a $APP" ;;
  *) reset=1 ;;
esac
if [ "$reset" = 1 ]; then
  echo " RESULT: !! CLOCK RESET — relayer restarted at $fly_started. The 48h window restarts from there."
elif [ "$health" != "ok" ] || [ "$owner" != "$OWNER_EXPECT" ] || [ "$engine" != "$ENGINE_EXPECT" ]; then
  echo " RESULT: !! ANOMALY — check the NO/UNREACHABLE line(s) above."
elif awk "BEGIN{exit !($now>=$end)}"; then
  echo " RESULT: ** 48h COMPLETE & healthy — ready for closeout (flip SAFETY-21)."
else
  echo " RESULT: OK — clock intact, everything healthy. Just let it run. Do NOT redeploy/restart."
fi
echo "======================================================"
