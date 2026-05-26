#!/usr/bin/env bash
# Builds the site and copies dist/ into s3-upload/ (flat — ready for S3 console upload)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Building..."
npm run build

UPLOAD_DIR="$ROOT/s3-upload"
rm -rf "$UPLOAD_DIR"
mkdir -p "$UPLOAD_DIR"
cp -R dist/. "$UPLOAD_DIR/"

echo ""
echo "Ready: $UPLOAD_DIR"
echo "Files: $(find "$UPLOAD_DIR" -type f | wc -l | tr -d ' ')"
echo ""
echo "S3 console: Add folder → select: s3-upload"
echo "  index.html must be at bucket root (not inside a dist/ prefix)."
ls -la "$UPLOAD_DIR" | head -20
