#!/usr/bin/env bash
# Convenience launcher for the AXHY DEV-only screenshot receiver.
# Binds 0.0.0.0:9999 so the iPhone on the same LAN can POST screenshots.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/screenshot-receiver.mjs" "$@"
