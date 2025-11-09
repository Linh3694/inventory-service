#!/bin/bash

# 🔄 Daily Cron Job: Sync Enabled Users to Inventory Service
#
# This script is meant to be run by cron to sync users daily.
# Example cron entry (runs at 2 AM daily):
#   0 2 * * * cd /path/to/inventory-service && ./scripts/sync-users-cron.sh
#
# Make sure to set environment variables in your .env or pass them via cron:
#   - FRAPPE_API_TOKEN or FRAPPE_API_KEY/FRAPPE_API_SECRET
#   - FRAPPE_API_URL
#   - INVENTORY_SERVICE_URL

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load environment variables
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  source "$PROJECT_DIR/.env"
  set +a
elif [ -f "$PROJECT_DIR/config.env" ]; then
  set -a
  source "$PROJECT_DIR/config.env"
  set +a
fi

# Check if required authentication is available
if [ -z "$FRAPPE_API_TOKEN" ] && [ -z "$FRAPPE_API_KEY" ]; then
  echo "❌ Error: FRAPPE_API_TOKEN or FRAPPE_API_KEY environment variable not set"
  exit 1
fi

echo "🔄 Starting daily inventory-service user sync cron job..."
node "$SCRIPT_DIR/sync-users-cron.js"

