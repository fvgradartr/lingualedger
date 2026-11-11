# Architecture

LinguaLedger is one Next.js app plus one Rust contract.

```
Browser
  /                 desk: paste, quote, demo pay, dry 1Click quote
  /order/[id]       timeline, deliverable, receipt
  /ledger           policy, desk jobs, testnet jobs
        |
        v
Route handlers
  /api/quote
  /api/order          also /api/process
  /api/order/[id]
  /api/ledger
  /api/policy         local kill switch
  /api/oneclick/quote
  /api/oneclick/status
  /api/market/webhook
        |
        +-- data/ledger.json (or memory if the disk is read-only)
        +-- testnet RPC views of lingualedger584b.testnet
        +-- NEAR AI Cloud, only if NEAR_AI_API_KEY is set
        +-- 1Click POST /v0/quote with dry: true
```

The worker entry points are `npm run demo` (one local job) and `npm run worker` (one Agent Market poll). They import the same pipeline as the API.

Pricing math in `src/lib/pricing.ts` matches `quote_yocto` and `allocate_split` in `contract/src/lib.rs`. Tests on both sides use the same vectors: 41 words floors at 0.05 NEAR, and a 1-yocto split pays the dust to the reserve.

On chain, orders live in an `IterableMap`. The unit tests hold that map across caller changes. A sandbox test is not in the default `cargo test` run. The protocol check that matters, the function-call allowlist, is `node scripts/prove-fc-key.mjs` against the deployed account.
