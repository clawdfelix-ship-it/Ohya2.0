#!/usr/bin/env bash
#
# run-sync-supervised.sh
#
# Ohya2.0 全店同步嘅 supervisor 包裝（畀 launchd 或手動跑）。
# 解決「process 閃斷/重開機後要人手重啟」嘅問題：
#   - 一輪成功完成（node exit 0）→ 閒置 SYNC_IDLE_SLEEP 秒（預設 6h）再跑下一輪
#   - 一輪失敗（node exit != 0）→ 退避 SYNC_FAIL_SLEEP 秒（預設 120s）後無限重試
# node 內部已有「請求指數退避重試＋失敗 item 跳過」，呢層再兜底整個進程。
#
# 受 launchd KeepAlive 兜底：連呢個 wrapper 都死咗，launchd 都會重啟佢。
set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_BIN="${NODE_BIN:-/opt/homebrew/bin/node}"

IDLE_SLEEP="${SYNC_IDLE_SLEEP:-21600}"   # 成功一輪後等幾耐（6h）
FAIL_SLEEP="${SYNC_FAIL_SLEEP:-120}"     # 失敗後幾多重試
MAX_CONSEC_FAILS="${SYNC_MAX_CONSEC_FAILS:-0}"  # 0 = 無限重試

cd "$PROJECT_DIR"

# 載入 .env（CRON_SECRET 等），容許檔案內有引號
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

consec_fails=0

while true; do
  echo "[$(date '+%F %T')] === sync run start ==="
  "$NODE_BIN" scripts/sync-all-categories.js
  rc=$?

  if [ "$rc" -eq 0 ]; then
    consec_fails=0
    echo "[$(date '+%F %T')] === sync run OK；${IDLE_SLEEP}s 後再跑下一輪 ==="
    sleep "$IDLE_SLEEP"
  else
    consec_fails=$((consec_fails + 1))
    echo "[$(date '+%F %T')] === sync run FAILED (rc=$rc, 連續第 ${consec_fails} 次)；${FAIL_SLEEP}s 後重試 ==="
    if [ "$MAX_CONSEC_FAILS" -ne 0 ] && [ "$consec_fails" -ge "$MAX_CONSEC_FAILS" ]; then
      echo "[$(date '+%F %T')] 連續失敗達上限 ${MAX_CONSEC_FAILS}，退出（launchd KeepAlive 會重啟 wrapper）"
      exit 1
    fi
    sleep "$FAIL_SLEEP"
  fi
done
