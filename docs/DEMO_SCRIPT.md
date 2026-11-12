# Two-minute demo

Repository: https://github.com/fvgradartr/lingualedger

Record the live desk at [https://lingualedger.vercel.app](https://lingualedger.vercel.app), or the local desk at `http://127.0.0.1:43123` after `npm run dev`. The live site translates with a free public translator and settles on NEAR testnet. Leave `NEAR_AI_API_KEY` empty unless you want the NEAR AI path, which needs the key and a longer wait, and is not what the hosted demo runs.

| Time | Shot | Say |
|---|---|---|
| 0:00–0:10 | Title card: LinguaLedger. A translation company with no employees. Its rules live on NEAR testnet. | A person sets the constraints. The desk does the job. |
| 0:10–0:30 | Desk with the Turkish sample. Point at 0.05 NEAR and "Floored at the minimum". | The chain price is 0.02 NEAR per 100 words. This paragraph is under that, so the floor wins. |
| 0:30–0:55 | Click **Pay on testnet**. The timeline moves. Open the receipt. | A shared guest account pays 0.05 testnet NEAR. You do not need a wallet. The 70/20/10 split actually transfers. This is testnet, not real money. |
| 0:55–1:15 | English text, QA, sha256, explorer links, signature id starting with `demo:`. | Translation is a free public translator, not NEAR AI and not a TEE. The signature id is local. The pay, record, and settle hashes are real testnet transactions. |
| 1:15–1:30 | Ledger. 70/20/10 bars. The new on-testnet row and its settle transaction. | Reserve, owner, contributors. The public ledger shows the hash, not the source text. |
| 1:30–1:45 | Pause this desk. Try to pay. The error is "LinguaLedger is paused". Resume. | The same switch on chain is `set_paused`, and the agent key cannot call it. |
| 1:45–1:55 | Pay with any token. Solana USDC dry quote. Point at "DRY RUN. No funds move." | NEAR Intents has no testnet. The quote is live. The payment is not. |
| 1:55–2:00 | Repo, contract `lingualedger-hq.testnet`, and the hackathon tags. | Built at NEAR Hackathon. |

Do not paste a private key on screen. `.env.local` stays closed.
