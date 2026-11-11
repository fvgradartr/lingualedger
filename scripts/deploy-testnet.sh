#!/usr/bin/env bash
# Build the wasm if needed, deploy lingualedger-treasury to testnet, and add
# an agent function-call key. The owner secret stays outside the repo.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f contract/target/wasm32-unknown-unknown/release/lingualedger_treasury.wasm ]]; then
  npm run contract:build
fi
node scripts/deploy-testnet.mjs "${1:-lingualedger584b.testnet}"
