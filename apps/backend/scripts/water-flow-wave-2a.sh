#!/usr/bin/env bash
#
# Wave 2a Water-Flow — backend-only magic loop test.
# Sends a chat message, gets DecisionCard, applies it, verifies Assignment row.
#
# Prereqs:
#   1. Backend dev server running at localhost:4000:
#        cd apps/backend && pnpm dev
#   2. AXHY_OTP_BYPASS=1 in apps/backend/.env.local (already set)
#   3. Sandbox tenant seeded
#   4. ANTHROPIC_API_KEY set in apps/backend/.env.local (already set)
#
# Usage: ./apps/backend/scripts/water-flow-wave-2a.sh
#
# @derives(master-plan §G)

set -e

API="${API:-http://localhost:4000}"
SUPERVISOR_PHONE="+919999999999"
OTP_CODE="123456"

green='\033[0;32m'
red='\033[0;31m'
cyan='\033[0;36m'
yellow='\033[0;33m'
nc='\033[0m'

step() { echo -e "\n${cyan}▶ $1${nc}"; }
pass() { echo -e "${green}✓ $1${nc}"; }
fail() { echo -e "${red}✗ $1${nc}"; exit 1; }
info() { echo -e "${yellow}  $1${nc}"; }

# JSON helpers using Node.js — no jq dependency
json_get() {
  # Usage: json_get "$JSON_STRING" ".path.to.field"
  node -e "
    let raw = '';
    process.stdin.on('data', c => raw += c);
    process.stdin.on('end', () => {
      try {
        const obj = JSON.parse(raw);
        const path = process.argv[1].replace(/^\./, '').split('.');
        let v = obj;
        for (const p of path) v = v?.[p];
        if (v === undefined || v === null) {
          process.stdout.write('');
        } else if (typeof v === 'object') {
          process.stdout.write(JSON.stringify(v));
        } else {
          process.stdout.write(String(v));
        }
      } catch (e) { process.exit(1); }
    });
  " "$2" <<< "$1"
}

json_pretty() {
  # Usage: json_pretty "$JSON_STRING"
  node -e "
    let raw = '';
    process.stdin.on('data', c => raw += c);
    process.stdin.on('end', () => {
      try {
        const obj = JSON.parse(raw);
        process.stdout.write(JSON.stringify(obj, null, 2));
      } catch (e) { process.stdout.write(raw); }
    });
  " <<< "$1"
}

command -v curl >/dev/null 2>&1 || fail "curl not found"
command -v node >/dev/null 2>&1 || fail "node not found"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Wave 2a Water-Flow — voice → AI → DecisionCard → Apply"
echo "═══════════════════════════════════════════════════════════════"

# 1. Backend health check
step "1/7 Health check"
if ! curl -sf "$API/health" >/dev/null; then
  fail "Backend not reachable at $API. Run: cd apps/backend && pnpm dev"
fi
pass "Backend alive at $API"

# 2. Request OTP
step "2/7 Request OTP for $SUPERVISOR_PHONE"
OTP_REQ=$(curl -sf -X POST "$API/auth/otp/request" \
  -H 'Content-Type: application/json' \
  -d "{\"phone\":\"$SUPERVISOR_PHONE\"}")
json_pretty "$OTP_REQ"
echo ""
pass "OTP requested"

# 3. Verify OTP with bypass code
step "3/7 Verify OTP with bypass code 123456"
OTP_RES=$(curl -sf -X POST "$API/auth/otp/verify" \
  -H 'Content-Type: application/json' \
  -d "{\"phone\":\"$SUPERVISOR_PHONE\",\"code\":\"$OTP_CODE\"}")
TOKEN=$(json_get "$OTP_RES" ".accessToken")
[ -z "$TOKEN" ] && TOKEN=$(json_get "$OTP_RES" ".access_token")
if [ -z "$TOKEN" ]; then
  json_pretty "$OTP_RES"
  echo ""
  fail "No access token. Verify AXHY_OTP_BYPASS=1 + sandbox seeded."
fi
pass "JWT acquired"
info "${TOKEN:0:40}..."

# 4. Generate idempotency key
step "4/7 Generate Idempotency-Key"
IDEM=$(uuidgen | tr '[:upper:]' '[:lower:]')
pass "$IDEM"

# 5. Send chat message
step "5/7 POST /chat/messages — 'Add Pradeep to Apollo Hospital, Mon-Sat 9 to 5...'"
info "Calling real Anthropic Sonnet 4.6 — this takes 5-15 seconds..."
START_T=$(date +%s)
CHAT_RES=$(curl -sf -X POST "$API/chat/messages" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $IDEM" \
  -H 'Content-Type: application/json' \
  -d '{"text":"Add Pradeep to Apollo Hospital, Mon-Sat 9 to 5, starting Monday May 12 2026"}')
ELAPSED=$(($(date +%s) - START_T))
pass "Response in ${ELAPSED}s"
json_pretty "$CHAT_RES"
echo ""

# Extract DecisionCard fields
CHAT_MSG_ID=$(json_get "$CHAT_RES" ".chatMessageId")
TOOL_NAME=$(json_get "$CHAT_RES" ".decisionCard.toolName")
TOOL_INPUT=$(json_get "$CHAT_RES" ".decisionCard.fields")
[ -z "$TOOL_INPUT" ] && TOOL_INPUT="{}"

if [ -z "$TOOL_NAME" ]; then
  fail "No DecisionCard returned. AI may have asked clarification. See response above."
fi
pass "DecisionCard: $TOOL_NAME"

# 6. Apply DecisionCard
step "6/7 POST /chat/apply — confirm the proposed action"
APPLY_RES=$(curl -sf -X POST "$API/chat/apply" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"chatMessageId\":\"$CHAT_MSG_ID\",\"toolName\":\"$TOOL_NAME\",\"toolInput\":$TOOL_INPUT}")
json_pretty "$APPLY_RES"
echo ""
ASSIGN_ID=$(json_get "$APPLY_RES" ".id")
if [ -z "$ASSIGN_ID" ]; then
  fail "Apply did not return an Assignment id"
fi
pass "Assignment created: $ASSIGN_ID"

# 7. Final summary
step "7/7 Done — verify in Prisma Studio"
info "Open in browser: cd packages/shared-schema && pnpm exec prisma studio"
info "Look at axhy.Assignment table — id: $ASSIGN_ID"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo -e "  ${green}✓ MAGIC LOOP VERIFIED END-TO-END${nc}"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  Voice/text → Anthropic Sonnet 4.6 tool-use → DecisionCard →"
echo "  tap Apply → POST /assignments → real Assignment row in Railway."
echo ""
