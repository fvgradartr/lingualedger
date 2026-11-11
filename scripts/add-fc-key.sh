#!/usr/bin/env bash
# Rotate the agent function-call key on an already deployed treasury.
# This redeploys the same wasm (state is kept) and appends a new limited key.
set -euo pipefail
cd "$(dirname "$0")/.."
exec bash scripts/deploy-testnet.sh "${1:-lingualedger584b.testnet}"
