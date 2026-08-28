#!/usr/bin/env sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALLER_SCRIPT="$SCRIPT_DIR/scripts/installer.mjs"

if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
  echo "Suite de Agentes Installer (v1.1.0)"
  echo "Usage: ./install.sh [--dry-run] [--uninstall] [--target-dir <path>] [--config-dir <path>]"
  exit 0
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js (>= 24) is required to install Suite de Agentes, but was not found in PATH." >&2
  exit 1
fi

exec node "$INSTALLER_SCRIPT" --source-dir "$SCRIPT_DIR" "$@"
