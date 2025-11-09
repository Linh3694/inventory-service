#!/bin/bash

# 🔄 Sync Users from Frappe to Inventory Service
# 
# Usage: ./scripts/sync-all-users.sh <TOKEN> [BASE_URL]
# 
# Example:
#   ./scripts/sync-all-users.sh eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
#   ./scripts/sync-all-users.sh <TOKEN> https://admin.sis.wellspring.edu.vn

set -e

if [ -z "$1" ]; then
  echo "❌ Error: Token required"
  echo "Usage: ./scripts/sync-all-users.sh <TOKEN> [BASE_URL]"
  echo ""
  echo "Example:"
  echo "  ./scripts/sync-all-users.sh eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  exit 1
fi

TOKEN="$1"
BASE_URL="${2:-https://admin.sis.wellspring.edu.vn}"

echo "🔄 Syncing users to inventory-service..."
echo "📍 Target: $BASE_URL"
echo ""

node "$(dirname "$0")/sync-all-users.js" "$TOKEN" "$BASE_URL"

