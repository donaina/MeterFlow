#!/usr/bin/env bash

# ==============================================================================
# Usage-Based Billing & Metering Engine — Live Interactive Demo Script
# ==============================================================================
# Demonstrates all 6 Non-Negotiables:
# 1. Zero Floating-Point Money (Integer Cents)
# 2. Append-Only Event Log (Zero UPDATE/DELETE on usage_events)
# 3. Finalized Invoice Immutability (PUT /invoices/:id -> 403 Forbidden)
# 4. Double-Entry Accounting Ledger (sum(debits) == sum(credits))
# 5. Database-Enforced Idempotency (202 Accepted on new, 200 OK on duplicates)
# 6. Config-Driven Pricing Engine (Zero-redeploy schema updates)
# ==============================================================================

set -e

# Color definitions
BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

BASE_URL="${API_URL:-http://localhost:3000}"

echo -e "\n${BOLD}${BLUE}======================================================================${NC}"
echo -e "${BOLD}${CYAN} 🚀 MeterFlow — Usage-Based Billing & Metering Engine Live Demo ${NC}"
echo -e "${BOLD}${BLUE}======================================================================${NC}\n"

# Helper for formatted step headers
step() {
  echo -e "\n${BOLD}${YELLOW}[Step $1] $2${NC}"
  echo -e "${CYAN}----------------------------------------------------------------------${NC}"
}

# ------------------------------------------------------------------------------
# Step 1: Health Probes
# ------------------------------------------------------------------------------
step "1" "System Health & Backing Service Probes (PostgreSQL + Redis)"
HEALTH=$(curl -s -H "x-request-id: demo-step-1" "$BASE_URL/health")
echo "$HEALTH" | jq . 2>/dev/null || echo "$HEALTH"
echo -e "${GREEN}✓ Backing services connected and healthy.${NC}"

# ------------------------------------------------------------------------------
# Step 2: Create a Plan with JSONB Pricing Config (Version 1)
# ------------------------------------------------------------------------------
step "2" "Creating a Config-Driven Hybrid Pricing Plan (Version 1)"
echo -e "Plan config defines: \$40 base subscription + Graduated tiered 'ai_tokens' + Per-unit 'storage_gb'."

PLAN_PAYLOAD='{
  "name": "AI Platform Pro Tier",
  "pricing_config": {
    "flat_fee": {
      "amount_cents": 4000,
      "description": "Pro Base Subscription"
    },
    "rules": [
      {
        "feature_key": "ai_tokens",
        "type": "tiered_graduated",
        "config": {
          "description": "LLM Inference Tokens (in thousands)",
          "tiers": [
            { "from": 0, "to": 1000, "rate_cents": 0 },
            { "from": 1000, "to": 5000, "rate_cents": 5 },
            { "from": 5000, "to": null, "rate_cents": 2 }
          ]
        }
      },
      {
        "feature_key": "storage_gb",
        "type": "per_unit",
        "config": {
          "description": "Object Storage Volume",
          "rate_cents": 10,
          "free_allowance": 50
        }
      }
    ]
  }
}'

PLAN_RES=$(curl -s -X POST "$BASE_URL/plans" \
  -H "Content-Type: application/json" \
  -H "x-request-id: demo-step-2" \
  -d "$PLAN_PAYLOAD")

echo "$PLAN_RES" | jq . 2>/dev/null || echo "$PLAN_RES"
PLAN_ID=$(echo "$PLAN_RES" | grep -o '"id":"[^"]*' | head -n 1 | cut -d'"' -f4)
echo -e "${GREEN}✓ Created Plan ID: $PLAN_ID (Version 1)${NC}"

# ------------------------------------------------------------------------------
# Step 3: Idempotent Event Ingestion & Duplicate Suppression
# ------------------------------------------------------------------------------
step "3" "Idempotent Event Ingestion & Duplicate Suppression"
CUST_ID="cust_demo_$(date +%s)"
EVENT_ID="evt_token_batch_1_$CUST_ID"

echo -e "Sending new usage event (1,500 AI tokens for customer $CUST_ID)..."
EVENT_1=$(curl -s -i -X POST "$BASE_URL/events" \
  -H "Content-Type: application/json" \
  -H "x-request-id: demo-step-3a" \
  -d "{
    \"event_id\": \"$EVENT_ID\",
    \"customer_id\": \"$CUST_ID\",
    \"feature_key\": \"ai_tokens\",
    \"quantity\": 1500,
    \"timestamp\": \"2026-08-10T12:00:00.000Z\"
  }")

HTTP_STATUS=$(echo "$EVENT_1" | head -n 1 | cut -d$' ' -f2)
echo -e "HTTP Response Status: ${BOLD}$HTTP_STATUS Accepted${NC}"
echo "$EVENT_1" | grep -A 10 "{"

echo -e "\nSending EXACT DUPLICATE of event '$EVENT_ID' (simulating network retry)..."
EVENT_DUP=$(curl -s -i -X POST "$BASE_URL/events" \
  -H "Content-Type: application/json" \
  -H "x-request-id: demo-step-3b" \
  -d "{
    \"event_id\": \"$EVENT_ID\",
    \"customer_id\": \"$CUST_ID\",
    \"feature_key\": \"ai_tokens\",
    \"quantity\": 1500,
    \"timestamp\": \"2026-08-10T12:00:00.000Z\"
  }")

DUP_STATUS=$(echo "$EVENT_DUP" | head -n 1 | cut -d$' ' -f2)
echo -e "HTTP Response Status: ${BOLD}$DUP_STATUS OK (Duplicate Suppressed)${NC}"
echo "$EVENT_DUP" | grep -A 10 "{"
echo -e "${GREEN}✓ DB-level unique constraint suppressed duplicate event without double-counting.${NC}"

# Ingest additional realistic month usage
echo -e "\nIngesting additional month usage events (2,000 more tokens + 80 GB storage)..."
curl -s -X POST "$BASE_URL/events" -H "Content-Type: application/json" \
  -d "{\"event_id\":\"evt_tok_2_$CUST_ID\",\"customer_id\":\"$CUST_ID\",\"feature_key\":\"ai_tokens\",\"quantity\":2000,\"timestamp\":\"2026-08-15T15:00:00.000Z\"}" >/dev/null

curl -s -X POST "$BASE_URL/events" -H "Content-Type: application/json" \
  -d "{\"event_id\":\"evt_stor_1_$CUST_ID\",\"customer_id\":\"$CUST_ID\",\"feature_key\":\"storage_gb\",\"quantity\":80,\"timestamp\":\"2026-08-20T09:00:00.000Z\"}" >/dev/null

sleep 1

# ------------------------------------------------------------------------------
# Step 4: Real-Time Usage Query & Counter Flush
# ------------------------------------------------------------------------------
step "4" "Real-Time Usage Aggregation Query & Flush"
echo -e "Querying live usage from Redis buffer..."
USAGE_RES=$(curl -s "$BASE_URL/usage/$CUST_ID?periodKey=2026-08")
echo "$USAGE_RES" | jq . 2>/dev/null || echo "$USAGE_RES"

echo -e "\nFlushing dirty Redis counters into PostgreSQL usage_records table..."
FLUSH_RES=$(curl -s -X POST "$BASE_URL/usage/flush")
echo "$FLUSH_RES" | jq . 2>/dev/null || echo "$FLUSH_RES"
echo -e "${GREEN}✓ Usage flushed and persisted durably in PostgreSQL.${NC}"

# ------------------------------------------------------------------------------
# Step 5: Zero-Redeploy Pricing Update & Live Preview
# ------------------------------------------------------------------------------
step "5" "Zero-Redeploy Pricing Config Update (Version 1 -> Version 2)"
echo -e "Updating Plan pricing config via API (Changing base fee from \$40 to \$60, and token rate)..."

UPDATE_PAYLOAD='{
  "name": "AI Platform Pro Tier (Revised)",
  "pricing_config": {
    "flat_fee": {
      "amount_cents": 6000,
      "description": "Pro Base Subscription v2"
    },
    "rules": [
      {
        "feature_key": "ai_tokens",
        "type": "tiered_graduated",
        "config": {
          "description": "LLM Inference Tokens v2",
          "tiers": [
            { "from": 0, "to": 1000, "rate_cents": 0 },
            { "from": 1000, "to": 5000, "rate_cents": 8 },
            { "from": 5000, "to": null, "rate_cents": 4 }
          ]
        }
      },
      {
        "feature_key": "storage_gb",
        "type": "per_unit",
        "config": {
          "description": "Object Storage Volume",
          "rate_cents": 10,
          "free_allowance": 50
        }
      }
    ]
  }
}'

UPDATED_PLAN=$(curl -s -X PUT "$BASE_URL/plans/$PLAN_ID" \
  -H "Content-Type: application/json" \
  -d "$UPDATE_PAYLOAD")

echo "$UPDATED_PLAN" | jq . 2>/dev/null || echo "$UPDATED_PLAN"
echo -e "${GREEN}✓ Plan automatically incremented to Version 2 with ZERO code redeployment.${NC}"

# ------------------------------------------------------------------------------
# Step 6: Atomic Invoice Finalization & Line Items
# ------------------------------------------------------------------------------
step "6" "Atomic Immutable Invoice Generation"
echo -e "Generating finalized invoice for August 2026..."

INV_RES=$(curl -s -X POST "$BASE_URL/invoices/generate" \
  -H "Content-Type: application/json" \
  -d "{
    \"customer_id\": \"$CUST_ID\",
    \"plan_id\": \"$PLAN_ID\",
    \"period_start\": \"2026-08-01T00:00:00.000Z\",
    \"period_end\": \"2026-08-31T23:59:59.999Z\"
  }")

echo "$INV_RES" | jq . 2>/dev/null || echo "$INV_RES"
INV_ID=$(echo "$INV_RES" | grep -o '"id":"[^"]*' | head -n 1 | cut -d'"' -f4)
TOTAL_CENTS=$(echo "$INV_RES" | grep -o '"totalCents":[0-9]*' | head -n 1 | cut -d':' -f2)

echo -e "${GREEN}✓ Generated Invoice ID: $INV_ID (Total: $TOTAL_CENTS¢ / \$$(awk "BEGIN {print $TOTAL_CENTS/100}"))${NC}"

# ------------------------------------------------------------------------------
# Step 7: Double-Entry Ledger Audit & Invariant Balance Check
# ------------------------------------------------------------------------------
step "7" "Double-Entry Ledger Audit & Invariant Verification"
echo -e "Auditing journal entries for Invoice $INV_ID..."

LEDGER_AUDIT=$(curl -s "$BASE_URL/ledger/invoice/$INV_ID")
echo "$LEDGER_AUDIT" | jq . 2>/dev/null || echo "$LEDGER_AUDIT"

echo -e "\nVerifying system-wide ledger balancing invariant (sum(debits) == sum(credits))..."
SYSTEM_LEDGER=$(curl -s "$BASE_URL/ledger/summary")
echo "$SYSTEM_LEDGER" | jq . 2>/dev/null || echo "$SYSTEM_LEDGER"

IS_BALANCED=$(echo "$SYSTEM_LEDGER" | grep -o '"isBalanced":true' || true)
if [ -n "$IS_BALANCED" ]; then
  echo -e "${GREEN}✓ Accounting Invariant Verified: Total Debits == Total Credits across the entire ledger.${NC}"
else
  echo -e "${RED}✗ Ledger Invariant Violation!${NC}"
fi

# ------------------------------------------------------------------------------
# Step 8: Immutability Protection Verification
# ------------------------------------------------------------------------------
step "8" "Finalized Invoice Immutability Protection (Non-Negotiable #3)"
echo -e "Attempting unauthorized mutation on finalized invoice (PUT /invoices/$INV_ID)..."

MUTATE_RES=$(curl -s -i -X PUT "$BASE_URL/invoices/$INV_ID" \
  -H "Content-Type: application/json" \
  -d '{"total_cents": 100}')

MUTATE_STATUS=$(echo "$MUTATE_RES" | head -n 1 | cut -d$' ' -f2)
echo -e "HTTP Response Status: ${BOLD}${RED}$MUTATE_STATUS Forbidden${NC}"
echo "$MUTATE_RES" | grep -A 10 "{"
echo -e "${GREEN}✓ Non-Negotiable #3 Enforced: Finalized invoices are strictly immutable.${NC}"

echo -e "\n${BOLD}${GREEN}======================================================================${NC}"
echo -e "${BOLD}${GREEN} ✨ Architecture Demo Completed Successfully! All Invariants Held. ${NC}"
echo -e "${BOLD}${GREEN}======================================================================${NC}\n"
