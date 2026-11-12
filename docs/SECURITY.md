# Security

Repository: https://github.com/fvgradartr/lingualedger

## Keys

The treasury account holds two kinds of key.

- A full-access key for the human. It can call `set_policy`, `set_paused`, `add_payee`, and `withdraw`, and it can add or delete keys. It lives in `~/.near-credentials/testnet/` or in `OWNER_PRIVATE_KEY` for a script. It is not in git and not in the web process.
- A function-call key whose receiver is the treasury. The live key's methods are `record_sale` and `settle` only (not `request_spend`). Allowance is 2 NEAR of gas. `scripts/deploy-testnet.mjs` writes this secret to `.env.local` only.
- A full-access key on `guest.lingualedger-hq.testnet` only. The live desk uses it to call `pay_order` with a real testnet deposit. A leak can spend the remaining guest balance, and only as payments into this treasury. It cannot withdraw from the treasury.

NEAR documents that a function-call access key is not a full account key: https://docs.near.org/protocol/accounts-contracts/access-keys. The contract also checks `predecessor`. Because the agent account id equals the contract account, the predecessor check alone would allow the full-access key to do agent work. The method list on the function-call key is what stops that key from calling `withdraw`. `node scripts/prove-fc-key.mjs` is the check. The observed withdraw error is `Access key does not allow method withdraw`.

`request_spend` is the only way that agent key can move NEAR, and only to an allowlisted account, under the daily cap, and without touching unsettled customer balances.

OutLayer custody is not integrated. It would be another way to hold the agent key. It is not required for this demo.

## Briefs

`briefFromPayload` copies `description` into the source text. Tags may select `tr`, `en`, or `es`. Nothing in the brief can flip `paused`, change the split, or choose a payee. The NEAR AI system prompt says the same thing when a key is set. A test covers a brief that asks the agent to withdraw.

## Webhooks

`X-Market-Signature` is HMAC-SHA256 of `timestamp` + `.` + raw body, compared in constant time, with a 5 minute window. In production, a missing `AGENT_MARKET_WEBHOOK_SECRET` rejects the call unless `DEMO_OPEN_WEBHOOK=1`.

## What stays off chain

The source text and the translation body stay in the local ledger (and in the browser's `localStorage` copy). The contract stores the sha256, a signature id (a local `demo:` id on the hosted desk, not a TEE attestation), the word count, the price, and the inference cost.

## Demo switch

`POST /api/policy` pauses the local desk. Set `DEMO_OPEN_KILL_SWITCH=0` to refuse that route. It does not call `set_paused` on chain.

## Hosted desk

The production Vercel project sets `AGENT_FC_PRIVATE_KEY` and `DEMO_PAYER_PRIVATE_KEY`. It never sets `OWNER_PRIVATE_KEY`. The function-call key cannot call `withdraw`, `set_policy`, `set_paused`, or `request_spend`. The guest key cannot sign for the treasury. A public hourly cap (`DEMO_MAX_SETTLEMENTS_PER_HOUR`, default 12) and the guest balance stop a flood of settlements. If a settle cannot complete, the desk still returns the translation and does not invent explorer hashes.
