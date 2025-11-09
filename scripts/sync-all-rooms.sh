#!/bin/bash

# 🏢 Sync Rooms from Frappe to Inventory Service
# 
# Usage: ./scripts/sync-all-rooms.sh <TOKEN> [BASE_URL]
# 
# Example:
#   ./scripts/sync-all-rooms.sh eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
#   ./scripts/sync-all-rooms.sh <TOKEN> https://admin.sis.wellspring.edu.vn

set -e

if [ -z "$1" ]; then
  echo "❌ Error: Token required"
  echo "Usage: ./scripts/sync-all-rooms.sh <TOKEN> [BASE_URL]"
  echo ""
  echo "Example:"
  echo "  ./scripts/sync-all-rooms.sh eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  exit 1
fi

TOKEN="$1"
BASE_URL="${2:-https://admin.sis.wellspring.edu.vn}"

echo "🔄 Syncing rooms to inventory-service..."
echo "📍 Target: $BASE_URL"
echo ""

node "$(dirname "$0")/sync-all-rooms.js" "$TOKEN" "$BASE_URL"

