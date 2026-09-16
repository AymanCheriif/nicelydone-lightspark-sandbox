# nicelydone-lightspark-sandbox

A minimal Node.js sandbox for integrating with [Lightspark](https://www.lightspark.com/) on
**REGTEST**. It demonstrates the two halves of a Lightning integration:

- **Outbound / test payments** — create a test-mode invoice on your node and simulate an
  inbound payment that settles it, entirely on REGTEST (no real bitcoin involved).
- **Inbound webhooks** — an Express server that receives Lightspark webhook deliveries,
  verifies their signatures, and records the events locally.

## Requirements

- Node.js **22+**
- A Lightspark account with a **REGTEST** node
- API token credentials (client id + secret) from the Lightspark dashboard

## Setup

```bash
npm install
cp .env.example .env
# then fill in .env with your REGTEST credentials
```

### Environment variables

| Variable | Description |
| --- | --- |
| `LIGHTSPARK_API_TOKEN_CLIENT_ID` | API token client id |
| `LIGHTSPARK_API_TOKEN_CLIENT_SECRET` | API token client secret |
| `LIGHTSPARK_NODE_ID` | Your REGTEST node id |
| `LIGHTSPARK_NODE_PASSWORD` | Password to unlock the node signing key |
| `LIGHTSPARK_WEBHOOK_SIGNING_KEY` | Signing key configured for your webhook endpoint |
| `PORT` | Local webhook server port (default `3000`) |

> `.env` is git-ignored. Never commit real credentials.

## Usage

### Run the payment sandbox

```bash
npm run sandbox
```

This authenticates, creates a test-mode invoice, loads the node signing key, and simulates a
payment that settles it. Watch the console for the invoice string and payment status.

### Run the webhook server

```bash
npm start
```

Endpoints:

| Method & path | Purpose |
| --- | --- |
| `POST /webhooks` | Receives signed Lightspark webhook deliveries |
| `GET /events` | Lists all received events |
| `GET /events/:id` | Fetches a single event by id |
| `GET /healthz` | Liveness check |

To receive real deliveries during local development, expose the port with a tunnel (e.g.
`ngrok http 3000`) and register the resulting `/webhooks` URL plus your signing key in the
Lightspark dashboard.

## Project layout

```
src/
  client.js       # Lightspark client factory (reads env, builds auth provider)
  payments.js     # Sandbox script: test-mode invoice + simulated payment
  webhook.js      # Express server: verifies + stores incoming webhooks
  event-store.js  # Append-only in-memory + JSON-file event store
```

## Security notes

- Webhook payloads are verified against `LIGHTSPARK_WEBHOOK_SIGNING_KEY` using the raw request
  body; unsigned or mismatched requests are rejected with `401`.
- Everything runs against REGTEST test mode — no mainnet funds are ever moved.

## License

MIT
