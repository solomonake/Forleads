#!/usr/bin/env bash
# Live end-to-end smoke test of the Forleads product loop against a running
# server (default http://localhost:3000). Exercises: lead+swarm → note→situation
# → draft → compliance → approve (idempotent connector) → inbox → loops → report.
set -euo pipefail
BASE="${1:-http://localhost:3000}"
j() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval(sys.argv[1]))" "$1"; }

echo "▶ 1. Lead + scout swarm (12 Oak Street)"
LEAD=$(curl -s -X POST "$BASE/api/lead" -H 'content-type: application/json' \
  -d '{"address":"12 Oak Street","lng":-122.4469,"lat":37.7694,"locality":"San Francisco"}')
LEAD_ID=$(echo "$LEAD" | j "d['lead']['id']")
GRADE=$(echo "$LEAD" | j "d['summary']['grade']")
NCARDS=$(echo "$LEAD" | j "len(d['summary']['cards'])")
echo "   lead=$LEAD_ID · overall grade=$GRADE · $NCARDS cited cards"

echo "▶ 2. Note → situation"
NOTE=$(curl -s -X POST "$BASE/api/notes" -H 'content-type: application/json' \
  -d "{\"leadId\":\"$LEAD_ID\",\"body\":\"Knocked, no answer. Nice yard, kids' bikes out front.\"}")
SIT=$(echo "$NOTE" | j "d['classification']['situation']")
echo "   situation=$SIT"

echo "▶ 3. Draft (composer + fail-closed compliance)"
DRAFT=$(curl -s -X POST "$BASE/api/draft" -H 'content-type: application/json' \
  -d "{\"leadId\":\"$LEAD_ID\",\"situation\":\"$SIT\",\"actionType\":\"email\"}")
ART_ID=$(echo "$DRAFT" | j "d['artifact']['id']")
PASS=$(echo "$DRAFT" | j "d['artifact']['compliance_result']['pass']")
STATUS=$(echo "$DRAFT" | j "d['artifact']['status']")
echo "   artifact=$ART_ID · status=$STATUS · compliance.pass=$PASS"

echo "▶ 4. Approve (human gate → idempotent connector write)"
A1=$(curl -s -X POST "$BASE/api/approve" -H 'content-type: application/json' -d "{\"artifactId\":\"$ART_ID\"}")
PROV=$(echo "$A1" | j "d['connector']['provider']")
MODE=$(echo "$A1" | j "d['connector']['mode']")
echo "   wrote to $PROV ($MODE)"
echo "▶ 4b. Approve AGAIN → must be deduped (idempotency)"
A2=$(curl -s -X POST "$BASE/api/approve" -H 'content-type: application/json' -d "{\"artifactId\":\"$ART_ID\"}")
DEDUP=$(echo "$A2" | j "d['connector']['deduped']")
echo "   deduped=$DEDUP"

echo "▶ 5. Inbox + Weekly report"
INBOX=$(curl -s "$BASE/api/inbox" | j "len(d['items'])")
REPORT=$(curl -s "$BASE/api/report" | j "d['report']['metrics']")
echo "   inbox items=$INBOX · report metrics=$REPORT"

echo "▶ 6. Run no-contact loop"
RUN=$(curl -s -X POST "$BASE/api/loops" -H 'content-type: application/json' \
  -d "{\"loopId\":\"loop-no-contact\",\"leadId\":\"$LEAD_ID\"}")
RSTAT=$(echo "$RUN" | j "d['run']['status']")
echo "   loop run status=$RSTAT"

echo "✅ Smoke test complete."
