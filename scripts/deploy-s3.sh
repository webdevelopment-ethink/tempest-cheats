#!/usr/bin/env bash
# Upload site to S3 (requires: aws configure)
# Usage: ./scripts/deploy-s3.sh YOUR-BUCKET-NAME
set -euo pipefail

BUCKET="${1:-}"
if [[ -z "$BUCKET" ]]; then
  echo "Usage: ./scripts/deploy-s3.sh YOUR-BUCKET-NAME"
  echo "Example: ./scripts/deploy-s3.sh project-tempest-site"
  exit 1
fi

export PATH="$HOME/Library/Python/3.9/bin:${PATH:-}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Building..."
npm run build

echo "Uploading to s3://${BUCKET}/ ..."
aws s3 sync dist/ "s3://${BUCKET}/" --delete \
  --exclude "index.html" \
  --exclude "site.webmanifest"

aws s3 cp dist/index.html "s3://${BUCKET}/index.html" \
  --cache-control "public, max-age=0, must-revalidate" \
  --content-type "text/html"

aws s3 cp dist/site.webmanifest "s3://${BUCKET}/site.webmanifest" \
  --cache-control "public, max-age=0, must-revalidate" \
  --content-type "application/manifest+json"

echo ""
echo "Done. Open your bucket website endpoint in S3 → Properties → Static website hosting."
echo "Region ap-southeast-2 (Sydney) example:"
echo "  http://${BUCKET}.s3-website-ap-southeast-2.amazonaws.com"
echo ""
echo "Your bucket (if using southernoptimisation.com):"
echo "  http://southernoptimisation.com.s3-website-ap-southeast-2.amazonaws.com"
