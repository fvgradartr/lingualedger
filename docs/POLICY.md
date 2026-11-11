# Policy

The owner account `lingualedger584b.testnet` can replace this with `set_policy`. The deployed value is the default from `new`.

| Field | Value |
|---|---|
| `min_price_yocto` | 0.05 NEAR (`50000000000000000000000`) |
| `price_per_100w_yocto` | 0.02 NEAR |
| `max_daily_spend_yocto` | 0.5 NEAR |
| `split_bps[0]` | `reserve.lingualedger584b.testnet` 7000 |
| `split_bps[1]` | `lingualedger584b.testnet` 2000 |
| `split_bps[2]` | `contributors.lingualedger584b.testnet` 1000 |
| `allow_payees` | `reserve.lingualedger584b.testnet` |
| `paused` | false |

Quote: `blocks = ceil(words / 100)`, `price = max(blocks * price_per_100, min_price)`. Zero words quote as 0 and cannot be paid.

Split: every share after the reserve is `amount * bps / 10000`. The reserve receives `amount - allocated`, so the parts sum to the sale and dust stays in the operating reserve.

`request_spend` rolls a UTC day index from the block timestamp, refuses a payee that is not on the allowlist, refuses a spend that would pass the daily cap, and refuses a spend that would eat NEAR still locked in an unsettled order. A storage buffer of 0.05 NEAR is left on the account.

`set_paused(true)` makes `pay_order`, `record_sale`, and `request_spend` revert with `LinguaLedger is paused`. An agent `settle` reverts too. The owner can still settle, change policy, or withdraw surplus.
