#!/bin/bash

# Check Assignment History Fullname Issues Script
# This script checks how many assignmentHistory entries have null fullname

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "🔍 Check Assignment History Fullname Issues"
echo "=========================================="
echo ""

# Check if we're in the right directory
if [ ! -f "$PROJECT_DIR/package.json" ]; then
    echo "❌ Error: Not in inventory-service directory"
    echo "Please run this script from the inventory-service root directory"
    exit 1
fi

# Check if config.env exists
if [ ! -f "$PROJECT_DIR/config.env" ]; then
    echo "❌ Error: config.env file not found"
    echo "Please ensure config.env exists in the project directory"
    exit 1
fi

# Run the Node.js script
echo "🚀 Starting check process..."
echo ""

cd "$PROJECT_DIR"
node scripts/check-assignment-history-fullname.js

echo ""
echo "✅ Check process completed!"
