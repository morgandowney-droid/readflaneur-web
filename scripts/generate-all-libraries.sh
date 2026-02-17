#!/bin/bash
# Generate image libraries for all neighborhoods in batches
# Each batch runs as a Vercel function (300s max). Curl will timeout
# at 60s but the function continues running. We wait between batches
# and poll status to track progress.
#
# With 7s spacing between Imagen 4 API calls (10 RPM limit):
# - Each neighborhood takes ~90-100s
# - Each function invocation processes 2-3 neighborhoods (270s budget)
# - Total: ~265 neighborhoods / 2.5 avg = ~106 batches x 5min = ~8-9 hours

set -e

cd "$(dirname "$0")/.."

CRON_SECRET=$(grep CRON_SECRET .env.local | head -1 | cut -d= -f2 | tr -d '"')
BASE_URL="https://readflaneur.com"
BATCH_SIZE=3
WAIT_BETWEEN=300  # 5 minutes between batches (function takes ~200-270s)

check_status() {
  curl -s --max-time 30 "${BASE_URL}/api/admin/generate-image-library" \
    -H "x-cron-secret: ${CRON_SECRET}" 2>/dev/null | \
    node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
      try {
        const j=JSON.parse(d);
        console.log('Complete:',j.complete,'/',j.total,'| Missing:',j.missing,'| Partial:',j.partial);
      } catch(e) {
        console.log('Status check failed');
      }
    })" 2>/dev/null
}

fire_batch() {
  local body="{\"batchSize\":${BATCH_SIZE}}"

  # Fire and don't wait for response (function continues after curl timeout)
  curl -s --max-time 15 -X POST "${BASE_URL}/api/admin/generate-image-library" \
    -H "Content-Type: application/json" \
    -H "x-cron-secret: ${CRON_SECRET}" \
    -d "$body" 2>/dev/null || true
}

echo "=== Image Library Batch Generator ==="
echo "Batch size: ${BATCH_SIZE}, Wait: ${WAIT_BETWEEN}s"
echo "Started at: $(date)"
echo ""

# Initial status
echo "Starting status:"
check_status
echo ""

BATCH_NUM=0
PREV_COMPLETE=0

while true; do
  BATCH_NUM=$((BATCH_NUM + 1))
  echo "[$(date +%H:%M:%S)] Batch ${BATCH_NUM}: Firing..."

  fire_batch

  echo "[$(date +%H:%M:%S)] Batch ${BATCH_NUM}: Waiting ${WAIT_BETWEEN}s..."
  sleep "$WAIT_BETWEEN"

  # Check progress
  STATUS=$(curl -s --max-time 30 "${BASE_URL}/api/admin/generate-image-library" \
    -H "x-cron-secret: ${CRON_SECRET}" 2>/dev/null)

  COMPLETE=$(echo "$STATUS" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).complete)}catch{console.log('?')}})" 2>/dev/null)
  MISSING=$(echo "$STATUS" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).missing)}catch{console.log('?')}})" 2>/dev/null)
  TOTAL=$(echo "$STATUS" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).total)}catch{console.log('?')}})" 2>/dev/null)

  NEW=$((COMPLETE - PREV_COMPLETE))
  PREV_COMPLETE=$COMPLETE

  echo "[$(date +%H:%M:%S)] Batch ${BATCH_NUM}: ${COMPLETE}/${TOTAL} complete (+${NEW}), ${MISSING} remaining"

  if [ "$MISSING" = "0" ]; then
    echo ""
    echo "=== ALL DONE! ${TOTAL} neighborhoods complete at $(date) ==="
    break
  fi

  # If no progress was made, wait longer (may be rate limited)
  if [ "$NEW" = "0" ] || [ "$NEW" = "-0" ]; then
    echo "[$(date +%H:%M:%S)] No progress - waiting extra 120s for rate limit cooldown..."
    sleep 120
  fi

  echo ""
done
