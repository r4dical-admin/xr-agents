#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
podman build -f Containerfile -t spatial-agent-ide-checks .
echo "Electron renderer tests and production builds passed in the container."
