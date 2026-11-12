# LinguaLedger

Code: [github.com/fvgradartr/lingualedger](https://github.com/fvgradartr/lingualedger)

LinguaLedger is a translation house with no employees. It sells Turkish, English, and Spanish jobs. A person sets the rules on NEAR testnet. The desk prices, translates, reviews, and records the split.

- Agencies are slow and want a bank invoice.
- A raw model call does not prove what was delivered, or where the source text went.
- Buyers and agents often hold balances on some other chain.

## Live demo

**[Open the desk](https://lingualedger.vercel.app)**

Hosted on Vercel with no paid API keys. A visitor's own Turkish, English, or Spanish text is translated by free public machine translation (MyMemory, then Wikimedia MinT, then a public Google endpoint as a last resort). A sponsored guest account then pays the quote in real testnet NEAR, the agent records the sha256, and `settle` transfers the 70/20/10 split on chain. You do not need a wallet. This is testnet only — no mainnet funds and no real money. If `NEAR_AI_API_KEY` is set, the desk would call NEAR AI Cloud instead; the live site does not set that key, and receipt ids that start with `demo:` are not TEE attestations. An hourly cap protects the guest balance. The canned desk sample still uses the local curated translation, so `npm test` and `npm run demo` do not need the network.

| | |
|---|---|
| Desk | [https://lingualedger.vercel.app](https://lingualedger.vercel.app) |
| Ledger | [https://lingualedger.vercel.app/ledger](https://lingualedger.vercel.app/ledger) |
| Live treasury | [`lingualedger-hq.testnet`](https://testnet.nearblocks.io/address/lingualedger-hq.testnet) |
| Guest payer | [`guest.lingualedger-hq.testnet`](https://testnet.nearblocks.io/address/guest.lingualedger-hq.testnet) |
| First live-desk settlement | [`ll-mwd0x0a0-6d5040`](https://testnet.nearblocks.io/txns/4uTmhZ2WTtJBJJJLP3yCmJdrddGah9So8Eb6EEYP3hSW) — pay [`7Hfihk9hd4fbRiKkgnkUYQh11PG8JgwM1NRgrmGVR2mB`](https://testnet.nearblocks.io/txns/7Hfihk9hd4fbRiKkgnkUYQh11PG8JgwM1NRgrmGVR2mB), record [`Cj22MKPbCsyWzsKPbHE5Zf6gyKNGogn6pabHym4W5x1r`](https://testnet.nearblocks.io/txns/Cj22MKPbCsyWzsKPbHE5Zf6gyKNGogn6pabHym4W5x1r) |
| First treasury (historical smoke) | [`lingualedger584b.testnet`](https://testnet.nearblocks.io/address/lingualedger584b.testnet), job [`ll-smoke-mwc7net4`](https://testnet.nearblocks.io/txns/8YJUsbb2mNFiSYncuZtinaEK2xSXnhV1Lcu9cRamVto9) |
| Agent Market | Not listed yet. The webhook and poll worker are in the repo. |
| Video | Not recorded yet. The shot list is `docs/DEMO_SCRIPT.md`. |

Screenshots from a local run of the steps below:

![Desk, 0.05 NEAR floored](docs/screenshots/desk.png)

![Receipt](docs/screenshots/receipt.png)

![Ledger](docs/screenshots/ledger.png)

![Paused](docs/screenshots/paused.png)

![Dry 1Click quote](docs/screenshots/dry-quote.png)

## Try it in 2 minutes

Needs Node.js 22 or newer (tested on 22.23.4) and npm 10. No API keys, no NEAR account, and no Rust. The commands below are the whole setup.

```bash
git clone https://github.com/fvgradartr/lingualedger
cd lingualedger
npm install
cp .env.example .env.local
npm test
npm run demo
npm run dev
```

`npm test` checks the quote floor, the 70/20/10 split, QA, the webhook signature, and the pause message. `npm run demo` prints one settled job: 0.05 NEAR, floored, a sha256, and three payout lines. Both finish without calling NEAR AI.

`npm run dev` listens on [http://127.0.0.1:43123](http://127.0.0.1:43123). For a local receipt that does not move NEAR, leave the payer and function-call keys empty. The contract id in that file is public. If you delete it, the app still uses `lingualedger-hq.testnet` from `src/lib/config.ts`.

1. Open [http://127.0.0.1:43123](http://127.0.0.1:43123). The Turkish sample is already in the box (41 words). The slip shows **0.05 NEAR** and the badge **Floored at the minimum**. The raw block price is 0.02 NEAR, so the floor wins. If testnet RPC answers, a second badge says **Price read on testnet**. If it does not, the same 0.05 NEAR floor is the built-in policy.
2. Click **Pay on testnet** on the live desk (or **Pay the local quote** in a no-key local run). On the live site a shared guest account pays 0.05 testnet NEAR, the agent records the hash, and settle moves the 70/20/10 split. You are not asked for a wallet.
3. The job page walks Quote, Paid, Translating, QA, Delivered, Recorded, Settled. You get the English translation, a QA score, a sha256, explorer links for the three transactions, and a signature id that starts with `demo:` (not a TEE attestation).
4. Open `/ledger`. The job is there with its hash. The split is 70% operating reserve, 20% owner, 10% contributors (0.035 / 0.01 / 0.005 NEAR), marked sent when settle succeeded. The **On testnet** table lists jobs from `lingualedger-hq.testnet` when the RPC answers.
5. On the ledger, click **Pause this desk**. Go back to `/` and pay again. The desk answers `LinguaLedger is paused`. Click **Resume this desk**.
6. On the slip, open **Pay with any token**, leave Solana USDC selected, and click **Request a dry quote**. You get a live 1Click EXACT_OUTPUT quote into native USDC on NEAR, labeled `DRY RUN. No funds move.`

The on-chain kill switch is owner-only. Do not pause the shared contract unless you hold the owner key. It would reject `pay_order` for everyone:

```bash
near contract call-function as-transaction lingualedger-hq.testnet set_paused \
  json-args '{"paused":true}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
  sign-as lingualedger-hq.testnet network-config testnet sign-with-legacy-keychain send
```

## Run locally

The judge path above is enough. These extra commands are optional.

```bash
npm run build            # production build, no secrets required
npm run test:contract    # cargo test. Needs Rust 1.95+ and the wasm32 target is only for deploy
```

With `NEAR_AI_API_KEY` set, `npm run demo` calls NEAR AI Cloud. Without it, the canned sample uses the local curated translator; any other text uses the free public translators above. If every public translator fails, the desk returns an error instead of a word-swap that leaves the source untranslated.

Contract-only:

```bash
cd contract && cargo test --lib
cargo build --manifest-path contract/Cargo.toml --target wasm32-unknown-unknown --release
bash scripts/deploy-testnet.sh lingualedger-hq.testnet
```

`scripts/deploy-testnet.sh` needs `near-cli` credentials or `OWNER_PRIVATE_KEY`. It writes the new function-call key to `.env.local` and does not print it. `bash scripts/add-fc-key.sh` rotates that key. `node scripts/prove-fc-key.mjs` checks that the key cannot call `withdraw` and can reach `record_sale`. `node scripts/smoke-testnet.mjs` pays 0.05 testnet NEAR and settles one job. Both need a local key and are optional.

## Deploy to Vercel

The live site is already at [https://lingualedger.vercel.app](https://lingualedger.vercel.app). The contract id defaults to `lingualedger-hq.testnet` in `src/lib/config.ts`. The hosted desk sets `AGENT_FC_PRIVATE_KEY` (methods: `record_sale` and `settle` only) and the sponsored guest's `DEMO_PAYER_PRIVATE_KEY`. It never sets `OWNER_PRIVATE_KEY`. The guest key can only spend the guest balance, and an hourly cap limits how many jobs settle. The pause button stays available because it only closes the local desk when `DEMO_OPEN_KILL_SWITCH=0`. No `vercel.json` is required. The app is a Next.js project at the repository root.

```bash
npx vercel link
npx vercel deploy --prod
```

Optional later, not required for the demo: `NEAR_AI_API_KEY` (or `NEARAI_API_KEY`) turns on NEAR AI Cloud. The desk still translates without it.

## How NEAR is used

- **Treasury** `lingualedger-treasury` on testnet. Policy, orders, spend cap, allowlist, 70/20/10 split, kill switch. Events follow NEP-297 (`standard: lingualedger`).
- **Function-call key** on that account, limited to `record_sale` and `settle` on the live key (no `request_spend`). `node scripts/prove-fc-key.mjs` checks that the key cannot call `withdraw`.
- **Sponsored guest** `guest.lingualedger-hq.testnet` calls `pay_order` with a real testnet deposit. The live desk holds that guest key. A leak can only spend the remaining guest balance, and only as payments into this treasury.
- **Views** from the desk and the ledger (`get_policy`, `get_orders`, `get_totals`) over testnet RPC. No key.
- **NEAR Intents 1Click** dry quotes only (`dry: true`). No deposit address, no swap.
- **NEAR AI Cloud** when `NEAR_AI_API_KEY` or `NEARAI_API_KEY` is set. OpenAI-compatible `POST /v1/chat/completions`. The response id is stored as the signature id. The hosted desk does not set this key, so that id is a local `demo:` value, not a TEE attestation.
- **Agent Market** webhook `POST /api/market/webhook` (HMAC `X-Market-Signature` over `timestamp.body`) and `npm run worker` for one poll. The agent is not registered on the market yet.

## What the agent cannot do

The owner full-access key stays with the human (`~/.near-credentials` or `OWNER_PRIVATE_KEY` for scripts) and is never on Vercel. The app is given a function-call key for `record_sale` and `settle`, plus a guest key that can only spend the guest's own testnet NEAR.

| Call | Who |
|---|---|
| `pay_order` | anyone, if the attached deposit covers the quote and the contract is not paused |
| `record_sale`, `request_spend` | agent account |
| `settle` | agent or owner. An agent call reverts while paused. |
| `set_policy`, `set_paused`, `add_payee`, `withdraw` | owner only |

`request_spend` also requires an allowlisted payee, room under `max_daily_spend`, and it will not spend NEAR that is still locked in an unsettled order. Rounding dust on a split goes to the reserve (share 0). A marketplace brief is source text. It is not instructions. See `docs/SECURITY.md`.

## Architecture

```
Customer (browser)
  Next.js desk  /  /order/[id]  /  /ledger
        |  quote, sponsored testnet pay, dry 1Click quote
        v
  API routes (pipeline, local ledger JSON, testnet views and calls)
        |                         \
        | free public MT           \  dry POST /v0/quote
        | (NEAR_AI_API_KEY optional) v
        v                      1click.chaindefuser.com
  guest.lingualedger-hq.testnet  --pay_order-->  lingualedger-hq.testnet
  FC key --record_sale / settle-->               70/20/10 transfers
```

More detail is in `docs/ARCHITECTURE.md` and `docs/POLICY.md`.

## Policy

| Rule | Value |
|---|---|
| Minimum price | 0.05 NEAR |
| Price per started 100 words | 0.02 NEAR, then the floor |
| Daily inference cap | 0.5 NEAR |
| Split | reserve 70% · owner 20% · contributors 10% |
| Allowlist | `reserve.lingualedger-hq.testnet` |
| Max words per job | 1,500 |
| Kill switch | `paused` |

A 41-word sample is one block (0.02 NEAR) and is sold at 0.05 NEAR. A 500-word job is 0.10 NEAR.

## Limitations

Honest list of what is real and what is a stand-in:

- **Real on testnet, on the live desk:** a sponsored guest calls `pay_order` with a real deposit, the agent calls `record_sale` and `settle`, and the 70/20/10 split transfers on `lingualedger-hq.testnet`. Receipts include explorer links. An hourly cap and the guest balance limit how many jobs can settle. The first treasury, `lingualedger584b.testnet`, still holds the original smoke job (`ll-smoke-mwc7net4`) and is not used by the hosted desk.
- **Local / no-key path:** if the guest or function-call keys are missing, the desk still translates and writes a labeled local receipt (`demo:` hashes). It does not invent explorer hashes, and it does not move NEAR. `npm test` and a bare `npm run dev` use this path.
- **Inference** on [lingualedger.vercel.app](https://lingualedger.vercel.app) is free public machine translation (MyMemory, then Wikimedia MinT, then a public Google endpoint), because that deployment has no `NEAR_AI_API_KEY`. The sample paragraph has a curated translation. If every public translator fails, the desk returns an error instead of leaving the source untranslated. QA still checks numbers, URLs, and the glossary, and a copy of the source scores poorly. The signature id is not a TEE attestation. Set the key and the same code calls NEAR AI Cloud. The official JS SDK wants Node 24, so this app uses the HTTP API on Node 22.
- **1Click** is dry-run only. There is no mainnet payment. Quotes under about 2 USDC are previewed as a 2 USDC exact output because that is a practical Intents size. The label says so.
- **Agent Market** is not registered. The webhook treats the brief as data and will translate it. Unsigned webhooks are refused in production unless `DEMO_OPEN_WEBHOOK=1`.
- **No wallet in the browser.** The owner uses `near-cli`. Judges use the sponsored guest.
- **Testnet only.** No mainnet funds.

## Hackathon

Built for **NEAR HACKATHON 2026**. Solo project.

Tracks: Autonomous Business (primary), Agent Economy, and Privacy.

All of this code was written after the 2026-10-19 announcement. Libraries and AI assistance are listed in `AI_USAGE.md`. License: MIT (`LICENSE`). Repository: https://github.com/fvgradartr/lingualedger
