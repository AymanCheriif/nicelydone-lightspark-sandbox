// Webhook server: receives Lightspark webhook deliveries, verifies their
// signature against LIGHTSPARK_WEBHOOK_SIGNING_KEY, and records each valid
// event in the local event store.
//
// Run with:  npm start
//
// Point your Lightspark webhook configuration at:  http://<host>:<PORT>/webhooks

import "dotenv/config";
import express from "express";
import {
  verifyAndParseWebhook,
  WEBHOOKS_SIGNATURE_HEADER,
} from "@lightsparkdev/lightspark-sdk";
import { addEvent, getEvents, getEventById } from "./event-store.js";

const PORT = Number(process.env.PORT) || 3000;
const WEBHOOK_SECRET = process.env.LIGHTSPARK_WEBHOOK_SIGNING_KEY;

if (!WEBHOOK_SECRET) {
  console.warn(
    "! LIGHTSPARK_WEBHOOK_SIGNING_KEY is not set — incoming webhooks " +
      "cannot be verified and will be rejected."
  );
}

const app = express();

// The signature is computed over the exact raw bytes of the request body,
// so we must NOT let a JSON parser touch it first. Capture the raw Buffer.
app.post(
  "/webhooks",
  express.raw({ type: "*/*" }),
  async (req, res) => {
    const signature = req.header(WEBHOOKS_SIGNATURE_HEADER);

    if (!WEBHOOK_SECRET) {
      return res.status(500).send("Server missing webhook signing key.");
    }
    if (!signature) {
      return res.status(400).send(`Missing ${WEBHOOKS_SIGNATURE_HEADER} header.`);
    }

    let event;
    try {
      // Throws if the signature does not match the payload.
      event = await verifyAndParseWebhook(
        req.body, // raw Buffer / Uint8Array
        signature,
        WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("[webhook] signature verification failed:", err.message);
      return res.status(401).send("Invalid signature.");
    }

    const stored = addEvent(event);
    console.log(
      `[webhook] ${event.event_type} for ${event.entity_id} ` +
        `(event ${event.event_id}) accepted.`
    );

    // Acknowledge fast; Lightspark retries on non-2xx responses.
    return res.status(200).json({ received: true, id: stored.event_id });
  }
);

// Convenience read endpoints for inspecting what we've received.
app.get("/events", (_req, res) => {
  res.json(getEvents());
});

app.get("/events/:id", (req, res) => {
  const event = getEventById(req.params.id);
  if (!event) return res.status(404).json({ error: "not found" });
  res.json(event);
});

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Lightspark webhook server listening on port ${PORT}`);
  console.log(`  POST /webhooks      ← Lightspark deliveries`);
  console.log(`  GET  /events        ← all received events`);
  console.log(`  GET  /events/:id    ← one event by id`);
  console.log(`  GET  /healthz       ← liveness check`);
});
