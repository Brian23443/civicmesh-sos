#!/usr/bin/env bash
# Downloads the assets git doesn't track (offline map + on-phone model) from the GitHub release,
# verifies their checksums, and puts them where the dashboard and survivor app expect them.
set -euo pipefail
REPO="Brian23443/civicmesh-sos"
TAG="${1:-v1.0-demo}"
BASE="https://github.com/$REPO/releases/download/$TAG"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading release $TAG …"
for f in SHA256SUMS.txt demo.pmtiles web-model.tar.gz; do
  curl -fL --progress-bar -o "$TMP/$f" "$BASE/$f"
done
(cd "$TMP" && shasum -a 256 -c SHA256SUMS.txt)

mkdir -p "$ROOT/dashboard/public" "$ROOT/web/public/model"
mv "$TMP/demo.pmtiles" "$ROOT/dashboard/public/demo.pmtiles"
tar -xzf "$TMP/web-model.tar.gz" -C "$ROOT/web/public/model"
echo "Done: dashboard/public/demo.pmtiles and web/public/model/ are in place."
