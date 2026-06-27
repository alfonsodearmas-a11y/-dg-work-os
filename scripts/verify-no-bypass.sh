#!/usr/bin/env bash
# Fail if the E2E auth-bypass leaks into the EXECUTABLE production server bundle.
# Run after `next build`. String literals (E2E_AUTH_BYPASS, e2e_user) are never
# renamed by minification, so their absence from the executable .js proves the
# bypass logic — and its cookie reads — are tree-shaken out of production.
# Source maps (*.map) are excluded: they reference original source but do not run.
set -euo pipefail

DIR=".next/server"
if [ ! -d "$DIR" ]; then
  echo "✗ $DIR not found — run 'npm run build' first"; exit 2
fi

SYMBOLS=("E2E_AUTH_BYPASS" "e2e_user")
JS_COUNT=$(find "$DIR" -name "*.js" ! -name "*.map" | wc -l | tr -d ' ')
fail=0

for s in "${SYMBOLS[@]}"; do
  hits=$(find "$DIR" -name "*.js" ! -name "*.map" -print0 | xargs -0 grep -l "$s" 2>/dev/null || true)
  if [ -n "$hits" ]; then
    echo "✗ bypass symbol '$s' PRESENT in the executable bundle:"; echo "$hits"; fail=1
  else
    echo "✓ '$s' absent from $JS_COUNT executable .js files"
  fi
done

if [ "$fail" -ne 0 ]; then
  echo "AUTH BYPASS LEAK DETECTED — do not ship."; exit 1
fi
echo "OK: the E2E auth bypass is absent from the production build ($JS_COUNT executable .js files scanned)."
