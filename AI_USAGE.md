# Libraries and AI assistance

Repository: https://github.com/fvgradartr/lingualedger

LinguaLedger was written with Cursor Grok 4.7 during NEAR Hackathon 2026. The human spec was followed, then renamed from the working title to LinguaLedger. Review the contract and the desk before relying on either.

## Libraries

- Next.js 16, React 19, TypeScript, Tailwind CSS 4
- shadcn/ui (base-nova) on Base UI: button, input, textarea, tabs, badge, card, separator, label
- `near-api-js` 7.x for signed testnet calls in the deploy, smoke, and function-call proofs
- `near-sdk` 5.30.1 for the treasury
- `near-cli-rs` 0.31.1 for the faucet and as the documented owner CLI
- Node test runner via `tsx` for the desk tests

No payment processor, database, or hosted key is required to run the demo.

## What the model wrote

The treasury, the Next.js desk, the demo translator, the 1Click dry-quote client, the tests, and these docs. The curated Turkish, English, and Spanish sample sentences were written for the demo so the no-key path still shows a real translation of that paragraph. Arbitrary text on the live demo, when NEAR AI Cloud is not configured, is translated by free public machine-translation APIs (MyMemory and Wikimedia MinT), not a paid key.
