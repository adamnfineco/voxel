#!/usr/bin/env bash
# Deploy voxel-signal to voxel.damnfine.xyz
#
# Usage: ./scripts/deploy-signal.sh
#
# What this does:
#   1. Cross-compile voxel-signal for Linux x86_64
#   2. SCP the binary to /home/voxel/bin/ on the server
#   3. Restart the systemd service
#   4. Tail the log to confirm it came up

set -euo pipefail

cd "$(dirname "$0")/.."

# ── Config ────────────────────────────────────────────────────────────────────

SERVER="voxel@voxel.damnfine.xyz"
REMOTE_BIN="/home/voxel/bin/voxel-signal"
SERVICE="voxel-signal"
TARGET="x86_64-unknown-linux-gnu"

# ── Prerequisites ─────────────────────────────────────────────────────────────

source "$HOME/.cargo/env" 2>/dev/null || true

command -v cargo >/dev/null 2>&1 || { echo "❌ cargo not found"; exit 1; }
command -v ssh   >/dev/null 2>&1 || { echo "❌ ssh not found"; exit 1; }

# Check cross-compile target is installed
if ! rustup target list --installed | grep -q "$TARGET"; then
  echo "── Adding cross-compile target $TARGET..."
  rustup target add "$TARGET"
fi

# ── Build ─────────────────────────────────────────────────────────────────────

echo "── Building voxel-signal for $TARGET..."
cargo build --release --manifest-path signal/Cargo.toml --target "$TARGET"

LOCAL_BIN="target/$TARGET/release/voxel-signal"

if [[ ! -f "$LOCAL_BIN" ]]; then
  echo "❌ Build failed — $LOCAL_BIN not found"
  exit 1
fi

echo "   ✓ Built: $LOCAL_BIN ($(du -h "$LOCAL_BIN" | cut -f1))"

# ── Deploy ────────────────────────────────────────────────────────────────────

echo "── Deploying to $SERVER..."
ssh "$SERVER" "mkdir -p /home/voxel/bin"
scp "$LOCAL_BIN" "$SERVER:$REMOTE_BIN"
ssh "$SERVER" "chmod +x $REMOTE_BIN"
echo "   ✓ Binary uploaded"

# ── Restart service ───────────────────────────────────────────────────────────

echo "── Restarting $SERVICE..."
ssh "$SERVER" "sudo systemctl restart $SERVICE"
sleep 2

STATUS=$(ssh "$SERVER" "sudo systemctl is-active $SERVICE" 2>/dev/null || echo "unknown")
if [[ "$STATUS" == "active" ]]; then
  echo "   ✓ $SERVICE is active"
else
  echo "   ❌ $SERVICE status: $STATUS"
  echo ""
  echo "── Last 20 log lines:"
  ssh "$SERVER" "sudo journalctl -u $SERVICE -n 20 --no-pager"
  exit 1
fi

# ── Verify ────────────────────────────────────────────────────────────────────

echo ""
echo "── Recent logs:"
ssh "$SERVER" "sudo journalctl -u $SERVICE -n 10 --no-pager"

echo ""
echo "Done. voxel-signal is live at wss://voxel.damnfine.xyz"
