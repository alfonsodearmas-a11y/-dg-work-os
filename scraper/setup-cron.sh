#!/bin/bash
# Setup daily cron job for oversight scraper (6 AM highlights mode).
# Usage: bash setup-cron.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CRON_CMD="0 6 * * * cd $SCRIPT_DIR && /usr/bin/node scraper.js --highlights >> output/cron.log 2>&1"

# Check if cron entry already exists
if crontab -l 2>/dev/null | grep -q "oversight-scraper\|scraper.js --highlights"; then
  echo "Cron job already exists. Current crontab:"
  crontab -l | grep "scraper"
  exit 0
fi

# Add cron entry
(crontab -l 2>/dev/null; echo "# oversight-scraper: daily 6 AM highlights"; echo "$CRON_CMD") | crontab -

echo "Cron job installed:"
echo "  $CRON_CMD"
echo ""
echo "Verify with: crontab -l"
