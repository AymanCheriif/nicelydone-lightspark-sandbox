# nicelydone-lightspark-sandbox

A minimal Node.js sandbox for the **Lightspark Grid** API. It demonstrates the two
halves of a Grid integration against the **sandbox** environment:

- **Payment lifecycle** (`npm run sandbox`) — reads platform config, funds an internal
  account, creates and executes quotes ("invoices"), runs negative/failure cases, and
  lists the resulting transactions, printing structured JSON at each step.
- **Signed webhooks** (`npm start`) — an Express server that verifies each delivery's
  `X-Grid-Signature` (ECDSA P-256 / SHA-256 over the raw body), de-duplicates by event
  id, and stores sanitized records.

> **Grid, not Lightning.** This targets the Grid REST API
> (`@lightsparkdev/grid`, base `https://api.lightspark.com/grid/2025-10-13`) — *not*
> the Lightspark Lightning-node SDK. Everything runs in the sandbox; no real money moves.

> **Sandbox-only operation.** This project runs exclusively against the Grid
> **sandbox** environment (Grid's equivalent of Lightning REGTEST) — API tokens are
> environment-scoped, so sandbox tokens cannot touch production. No mainnet or
> real-money operations are performed anywhere in this code.

## Requirements

- Node.js **22+**
- A Lightspark Grid account with **sandbox** API tokens (Basic auth: client id + secret)

## Setup

```bash
npm install
cp .env.example .env
# then fill in .env with your sandbox credentials
```

### Environment variables

| Variable | Description |
| --- | --- |
| `GRID_API_BASE_URL` | Grid base URL (default `https://api.lightspark.com/grid/2025-10-13`) |
| `LIGHTSPARK_API_TOKEN_CLIENT_ID` / `..._SECRET` | **Sandbox Payments** token (used by `src/payments.js`) |
| `WEBHOOKS_API_TOKEN_CLIENT_ID` / `..._SECRET` | **Sandbox Webhooks** token |
| `RECONCILIATION_API_TOKEN_CLIENT_ID` / `..._SECRET` | **Sandbox Reconciliation** token |
| `LIGHTSPARK_WEBHOOK_SIGNING_KEY` | PEM public key from the dashboard webhook config (verifies `X-Grid-Signature`) |
| `PORT` | Local webhook server port (default `3000`) |

> `.env` is git-ignored. Never commit real credentials.

## Usage

### Run the payment sandbox

```bash
npm run sandbox
```

Prints structured JSON for: platform config, three labeled funding operations
(200,000 / 75,000 / 25,000 cents), balances, three quote→payment lifecycles
(Acme onboarding fee, Northstar design review, Brightline support credit), three
negative cases (invalid quote id, over-balance payment, duplicate execution), a
"Cancelled customer credit" quote left unexecuted, and a detailed recent-transaction
list (direction, amounts, fees, timestamps).

Expected output includes a funded balance and `PROCESSING`/`COMPLETED` payment statuses
with real `Transaction:` ids, plus rejected negative cases with their failure reasons.
A successful run looks like:

```jsonc
=== Funding: Initial sandbox liquidity ===
{ "amount": 200000, "currency": "USD", "newBalance": 200000 }

=== Invoice → payment: Acme onboarding fee ===
{
  "description": "Acme onboarding fee",
  "amount": 20000,
  "quoteId": "Quote:01a0…",
  "quoteStatus": "PENDING",
  "paymentStatus": "PROCESSING",
  "transactionId": "Transaction:01a0…",
  "totalSendingAmount": 20000,
  "failureReason": null
}
// … then negatives (rejected), a cancelled quote, and the transaction list
✓ Sandbox lifecycle complete.
```

> Grid has no explicit quote-cancel endpoint — quotes are cancelled by expiry
> (~180s TTL). Set `RUN_EXPIRY_CASE=1 npm run sandbox` to also wait for the
> "Cancelled customer credit" quote to expire and prove that executing an expired
> quote is rejected.

### Run payouts

```bash
npm run payout
```

Sends an outgoing **platform payout**: creates an external recipient account and
transfers funds from the platform's internal account to it (appears under
**Payouts → Platform payouts** in the dashboard). Also attempts a **customer
payout** (create customer → external account → transfer), which is best-effort in
sandbox.

> Payouts need two permissions: creating a recipient requires a **MANAGE** token
> (Webhooks/Reconciliation) and sending requires a **TRANSACT** token (Payments).
> The script uses the Reconciliation client for setup and the Payments client to
> send.

### Run reconciliation

```bash
npm run reconcile
```

Uses the **Sandbox Reconciliation** token to read the internal-account balance and all
transactions, then prints a compact report: current balance, transaction count,
credit/debit totals (COMPLETED only), fees, and a status breakdown.

### Run the webhook server

```bash
npm start
```

| Method & path | Purpose |
| --- | --- |
| `POST /webhook` | Receives Grid deliveries; verifies `X-Grid-Signature`, then stores the event |
| `GET /health` | Returns `{ "status": "ok" }` |
| `GET /events` | Sanitized events: `eventId`, `type`, `entityId`, `timestamp` (no signatures/credentials) |

Expose it for real deliveries and register the endpoint in the dashboard:

```bash
ngrok http 3000
# then set <https-url>/webhook as the sandbox webhook endpoint,
# subscribing to the events you want, and paste its signing key into .env
```

## Project layout

```
src/
  client.js       # Grid client factory (Basic auth) + internal-account helpers
  payments.js     # Sandbox lifecycle: fund → quote → execute → negatives → cancel → list
  payouts.js      # Outgoing payouts: platform (internal → external) + customer payout
  reconcile.js    # Balance vs. transaction-total reconciliation (Reconciliation token)
  webhook.js      # Express server: ECDSA X-Grid-Signature verification + storage
  event-store.js  # Append-only in-memory + JSON-file store (saveEvent / listEvents)
```

## Security notes

- Webhook signatures are verified over the **raw** request body with the PEM public key;
  unsigned, mismatched, or tampered requests are rejected with `401` and never stored.
- Events are stored sanitized — no signatures or credentials are persisted or exposed.
- Sandbox environment only; API tokens are environment-scoped.

## License

MIT
