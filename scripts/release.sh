#!/usr/bin/env bash
# Voxel release script
# Usage: ./scripts/release.sh [version]
# Example: ./scripts/release.sh 0.1.0
#
# What this does:
#   1. Typecheck + signal server tests
#   2. Build Rust signal server + bundle as sidecar
#   3. Update version numbers
#   4. Build Tauri .app + .dmg (signed with Developer ID: A Damn Fine Co)
#   5. Create a git tag vX.Y.Z
#
# Notarization (for zero-prompt public releases) is a separate step.
# For test distribution, signing alone is sufficient — right-click → Open.

set -euo pipefail

cd "$(dirname "$0")/.."

# ── Version ───────────────────────────────────────────────────────────────────

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  VERSION=$(node -p "require('./package.json').version")
fi

echo "Building Voxel v${VERSION} for Apple Silicon (aarch64-apple-darwin)"
echo ""

# ── Prerequisites ─────────────────────────────────────────────────────────────

command -v cargo >/dev/null 2>&1 || { echo "ERROR: cargo not found — install Rust"; exit 1; }
command -v node  >/dev/null 2>&1 || { echo "ERROR: node not found"; exit 1; }
source "$HOME/.cargo/env" 2>/dev/null || true

# ── Step 1: Typecheck ─────────────────────────────────────────────────────────

echo "── TypeScript check..."
node node_modules/typescript/bin/tsc --noEmit --skipLibCheck
echo "   OK TypeScript clean"

# ── Step 2: Signal server build + tests ───────────────────────────────────────

echo "── Building signal server..."
cargo build --release --manifest-path signal/Cargo.toml

echo "── Running integration tests..."
./target/release/voxel-signal &
SIGNAL_PID=$!
sleep 1
node test-signal.mjs
kill $SIGNAL_PID 2>/dev/null || true
echo "   OK 21/21 tests passing"

# ── Step 3: Bundle sidecar ────────────────────────────────────────────────────

echo "── Bundling sidecar binary..."
mkdir -p src-tauri/binaries
cp target/release/voxel-signal \
   src-tauri/binaries/voxel-signal-aarch64-apple-darwin
echo "   OK voxel-signal-aarch64-apple-darwin"

# ── Step 4: Update version numbers ───────────────────────────────────────────

echo "── Updating version to ${VERSION}..."
node -e "
const fs=require('fs');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
pkg.version='${VERSION}';
fs.writeFileSync('package.json',JSON.stringify(pkg,null,2)+'\n');
"
node -e "
const fs=require('fs');
const cfg=JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json','utf8'));
cfg.version='${VERSION}';
fs.writeFileSync('src-tauri/tauri.conf.json',JSON.stringify(cfg,null,2)+'\n');
"
sed -i '' "s/^version = \".*\"/version = \"${VERSION}\"/" src-tauri/Cargo.toml
echo "   OK versions updated"

# ── Step 5: Build Tauri app ───────────────────────────────────────────────────

echo "── Building Tauri app..."
# Tauri's codesign step fails when the project is inside iCloud Drive (xattrs).
# We let the build finish, then sign manually from a staging dir outside iCloud.
cargo tauri build --target aarch64-apple-darwin --no-bundle 2>/dev/null || \
  cargo tauri build --target aarch64-apple-darwin || true

APP_SRC="target/aarch64-apple-darwin/release/bundle/macos/Voxel.app"

if [[ ! -d "$APP_SRC" ]]; then
  echo "ERROR: .app not found — build likely failed"
  exit 1
fi
echo "   OK build complete"

# ── Step 6: Sign from staging (iCloud xattr workaround) ──────────────────────

STAGING="/tmp/voxel-release-staging"
APP_PATH="$STAGING/Voxel.app"

echo "── Signing (via staging dir to avoid iCloud xattr issue)..."
rm -rf "$STAGING" && mkdir -p "$STAGING"
cp -R "$APP_SRC" "$APP_PATH"
xattr -rc "$APP_PATH"
codesign --force --deep \
  --sign "Developer ID Application: A Damn Fine Co (3YGSXDS222)" \
  --options runtime \
  "$APP_PATH" 2>&1
codesign --verify --deep --strict "$APP_PATH"
echo "   OK signed: Developer ID Application: A Damn Fine Co (3YGSXDS222)"

# ── Build DMG from signed app ─────────────────────────────────────────────────

DMG_PATH="$STAGING/Voxel_${VERSION}_aarch64.dmg"
hdiutil create -volname "Voxel" -srcfolder "$APP_PATH" -ov -format UDZO "$DMG_PATH" 2>&1
echo "   OK DMG: $DMG_PATH ($(du -h "$DMG_PATH" | cut -f1))"

# ── Install locally ───────────────────────────────────────────────────────────

echo "── Installing locally..."
pkill -x voxel 2>/dev/null || true
pkill -x voxel-signal 2>/dev/null || true
sleep 1
rm -rf /Applications/Voxel.app
cp -R "$APP_PATH" /Applications/Voxel.app
xattr -rc /Applications/Voxel.app
open /Applications/Voxel.app
echo "   OK installed + opened locally"

# ── Install on Stinabook ──────────────────────────────────────────────────────

STINABOOK="cnocito@macbook-pro.dolly-ruler.ts.net"
if ssh -o ConnectTimeout=5 "$STINABOOK" "echo ok" &>/dev/null; then
  echo "── Installing on Stinabook..."
  ssh "$STINABOOK" "pkill -x voxel 2>/dev/null; pkill -x voxel-signal 2>/dev/null; sleep 1; rm -rf /Applications/Voxel.app"
  scp -r "$APP_PATH" "$STINABOOK:/Applications/Voxel.app"
  ssh "$STINABOOK" "xattr -rc /Applications/Voxel.app && open /Applications/Voxel.app"
  echo "   OK installed + opened on Stinabook"
else
  echo "   SKIP Stinabook — not reachable"
fi

# ── Step 6: Git tag ───────────────────────────────────────────────────────────

echo ""
read -p "Create git tag v${VERSION} and push? [y/N] " confirm
if [[ "$confirm" =~ ^[Yy]$ ]]; then
  git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/binaries/
  git commit -m "release: v${VERSION}" || true
  git tag -a "v${VERSION}" -m "Voxel v${VERSION}"
  git push origin main
  git push origin "v${VERSION}"
  echo "   OK tagged v${VERSION} and pushed"
fi

echo ""
echo "Done! Voxel v${VERSION} — signed by A Damn Fine Co"
if [[ -n "$DMG_PATH" ]]; then
  echo "   DMG: $DMG_PATH"
fi
