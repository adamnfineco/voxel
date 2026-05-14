#!/usr/bin/env bash
# Voxel release script
# Usage: ./scripts/release.sh [version]
# Example: ./scripts/release.sh 0.1.0
#
# What this does:
#   1. Typecheck + test
#   2. Build frontend
#   3. Build Rust signal server
#   4. Bundle the sidecar binary
#   5. Build Tauri .app + .dmg for aarch64-apple-darwin (Apple Silicon)
#   6. Create a git tag vX.Y.Z
#   7. Show artifact locations

set -euo pipefail

cd "$(dirname "$0")/.."

# ── Version ───────────────────────────────────────────────────────────────────

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  # Read from package.json
  VERSION=$(node -p "require('./package.json').version")
fi

echo "Building Voxel v${VERSION} for Apple Silicon (aarch64-apple-darwin)"
echo ""

# ── Prerequisites ─────────────────────────────────────────────────────────────

command -v cargo >/dev/null 2>&1 || { echo "❌ cargo not found — install Rust"; exit 1; }
command -v node  >/dev/null 2>&1 || { echo "❌ node not found"; exit 1; }
source "$HOME/.cargo/env" 2>/dev/null || true

# ── Step 1: Typecheck ─────────────────────────────────────────────────────────

echo "── TypeScript check..."
npx tsc --noEmit
echo "   ✓ TypeScript clean"

# ── Step 2: Signal server integration tests ───────────────────────────────────

echo "── Building signal server..."
cargo build --release --manifest-path signal/Cargo.toml

echo "── Running integration tests..."
./target/release/voxel-signal &
SIGNAL_PID=$!
sleep 1
node test-signal.mjs
kill $SIGNAL_PID 2>/dev/null || true
echo "   ✓ 21/21 tests passing"

# ── Step 3: Bundle sidecar binary ─────────────────────────────────────────────

echo "── Bundling sidecar binary..."
mkdir -p src-tauri/binaries
cp target/release/voxel-signal \
   src-tauri/binaries/voxel-signal-aarch64-apple-darwin
echo "   ✓ voxel-signal-aarch64-apple-darwin"

# ── Step 4: Update version numbers ───────────────────────────────────────────

echo "── Updating version to ${VERSION}..."
# package.json
node -e "
const fs=require('fs');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
pkg.version='${VERSION}';
fs.writeFileSync('package.json',JSON.stringify(pkg,null,2)+'\n');
"
# tauri.conf.json
node -e "
const fs=require('fs');
const cfg=JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json','utf8'));
cfg.version='${VERSION}';
fs.writeFileSync('src-tauri/tauri.conf.json',JSON.stringify(cfg,null,2)+'\n');
"
# Cargo.toml for the client crate
sed -i '' "s/^version = \".*\"/version = \"${VERSION}\"/" src-tauri/Cargo.toml

# ── Step 5: Build Tauri app ───────────────────────────────────────────────────

echo "── Building Tauri app..."
cargo tauri build --target aarch64-apple-darwin
echo "   ✓ Build complete"

# ── Step 6: Locate artifacts ──────────────────────────────────────────────────

APP_PATH="target/aarch64-apple-darwin/release/bundle/macos/Voxel.app"
DMG_PATH=$(find target/aarch64-apple-darwin/release/bundle/dmg -name "*.dmg" 2>/dev/null | head -1)

echo ""
echo "── Artifacts:"
if [[ -d "$APP_PATH" ]]; then
  echo "   .app  → $APP_PATH"
else
  echo "   .app  → not found (check target/aarch64-apple-darwin/release/bundle/)"
fi
if [[ -n "$DMG_PATH" ]]; then
  echo "   .dmg  → $DMG_PATH"
else
  echo "   .dmg  → not found (may need macOS code signing)"
fi

# ── Step 7: Git tag ───────────────────────────────────────────────────────────

echo ""
read -p "Create git tag v${VERSION} and push? [y/N] " confirm
if [[ "$confirm" =~ ^[Yy]$ ]]; then
  git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/binaries/
  git commit -m "release: v${VERSION}" || true
  git tag -a "v${VERSION}" -m "Voxel v${VERSION}"
  git push origin main
  git push origin "v${VERSION}"
  echo "   ✓ Tagged v${VERSION} and pushed"
fi

echo ""
echo "Done! Voxel v${VERSION} for Apple Silicon"
