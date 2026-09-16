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
negative cases (invalid quote id, over-balance payment, duplicate execution), and the
recent transaction list.

Expected output includes a funded balance and `PROCESSING`/`COMPLETED` payment statuses
with real `Transaction:` ids, plus rejected negative cases with their failure reasons.

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
  client.js       # Grid client factory (Basic auth) + internal-account helper
  payments.js     # Sandbox lifecycle: fund → quote → execute → negatives → list
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
