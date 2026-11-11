# Two-minute demo

Repository: https://github.com/fvgradartr/lingualedger

Record the local desk at `http://127.0.0.1:43123` after `npm run dev`. Leave `NEAR_AI_API_KEY` empty unless you want the TEE path, which needs the key and a longer wait.

| Time | Shot | Say |
|---|---|---|
| 0:00–0:10 | Title card: LinguaLedger. A translation company with no employees. Its rules live on NEAR. | A person sets the constraints. The desk does the job. |
| 0:10–0:30 | Desk with the Turkish sample. Point at 0.05 NEAR and "Floored at the minimum". | The chain price is 0.02 NEAR per 100 words. This paragraph is under that, so the floor wins. |
| 0:30–0:50 | Click Pay the demo quote. The timeline moves. | Demo pay does not send tokens. The receipt is still a hash, a QA score, and a split. |
| 0:50–1:10 | English text, QA 100, sha256, TEE id starting with `demo:`. | With a NEAR AI Cloud key this id is the response id you can verify. Without it, the app says demo. |
| 1:10–1:30 | Ledger. 70/20/10 bars. The on-testnet row `ll-smoke-mwc7net4` and its settle transaction. | That row did move 0.05 testnet NEAR. Reserve, owner, contributors. |
| 1:30–1:45 | Pause this desk. Try to pay. The error is "LinguaLedger is paused". Resume. | The same switch on chain is `set_paused`, and the agent key cannot call it. |
| 1:45–1:55 | Pay with any token. Solana USDC dry quote. Point at "DRY RUN. No funds move." | NEAR Intents has no testnet. The quote is live. The payment is not. |
| 1:55–2:00 | Repo, contract `lingualedger584b.testnet`, and the hackathon tags. | Built at NEAR Hackathon. |

Do not paste a private key on screen. `.env.local` stays closed.
