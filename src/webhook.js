// Webhook server for Lightspark Grid.
//
// Grid signs each delivery with ECDSA (P-256 / SHA-256) over the raw request
// body and sends the signature in the `X-Grid-Signature` header. The SDK's
// `webhooks.unwrap()` only JSON-parses — it does NOT verify — so we verify the
// signature ourselves against LIGHTSPARK_WEBHOOK_SIGNING_KEY (a PEM public key)
// before storing anything.
//
// Run with:  npm start
// Endpoints:
//   POST /webhook     ← Grid deliveries (signature-verified)
//   GET  /health      ← { "status": "ok" }
//   GET  /events      ← sanitized event list (type, id, entity, timestamp)

import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import LightsparkGrid from "@lightsparkdev/grid";
import { saveEvent, listEvents } from "./event-store.js";

const PORT = Number(process.env.PORT) || 3000;
const SIGNING_KEY = process.env.LIGHTSPARK_WEBHOOK_SIGNING_KEY;
const SIGNATURE_HEADER = "x-grid-signature";

if (!SIGNING_KEY) {
  console.warn(
    "! LIGHTSPARK_WEBHOOK_SIGNING_KEY is not set — deliveries cannot be " +
      "verified and will be rejected with 401."
  );
}

// The signing key may be provided as a bare base64 SPKI or a full PEM block.
function toPem(key) {
  if (key.includes("BEGIN PUBLIC KEY")) return key;
  return `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`;
}

/**
 * Verify a Grid webhook signature over the raw body.
 * @param {Buffer} rawBody
 * @param {string} signatureHeader - value of X-Grid-Signature
 * @returns {boolean}
 */
function verifySignature(rawBody, signatureHeader) {
  if (!SIGNING_KEY || !signatureHeader) return false;

  // Signature is either {"v":"1","s":"<base64>"} or plain base64.
  let b64 = signatureHeader.trim();
  try {
    const parsed = JSON.parse(b64);
    if (parsed && typeof parsed.s === "string") b64 = parsed.s;
  } catch {
    // Not JSON — treat as raw base64.
  }

  try {
    const signature = Buffer.from(b64, "base64");
    const verifier = crypto.createVerify("SHA256");
    verifier.update(rawBody);
    verifier.end();
    return verifier.verify(toPem(SIGNING_KEY), signature);
  } catch (err) {
    console.error("[webhook] verification error:", err.message);
    return false;
  }
}

const grid = new LightsparkGrid({ username: "unused", password: "unused" });
const app = express();

// Preserve the exact raw bytes — the signature is computed over them, so a
// JSON parser must not touch the body first. Accept the delivery on "/webhook"
// and also on "/" so it works whether or not the dashboard endpoint URL
// includes the path.
app.post(["/webhook", "/"], express.raw({ type: "*/*" }), async (req, res) => {
  const signature = req.header(SIGNATURE_HEADER);

  if (!verifySignature(req.body, signature)) {
    console.warn("[webhook] rejected: invalid or missing signature");
    return res.status(401).json({ error: "invalid signature" });
  }

  let event;
  try {
    event = grid.webhooks.unwrap(req.body.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "malformed body" });
  }

  // Persist BEFORE acknowledging: if storage fails we return 5xx so Grid
  // retries, rather than losing the event behind an early 200. Storage is a
  // fast local write + in-memory de-dupe, so the response is still prompt.
  let record;
  let duplicate;
  try {
    ({ record, duplicate } = await saveEvent(event));
  } catch (err) {
    console.error("[webhook] storage failed, asking for retry:", err.message);
    return res.status(500).json({ error: "storage failed" });
  }

  console.log(
    `[webhook] ${duplicate ? "duplicate" : "accepted"} ` +
      `${record.type ?? "event"} (${record.eventId ?? "no-id"})`
  );
  return res.status(200).json({ received: true, duplicate, id: record.eventId });
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.get("/events", (_req, res) => res.json(listEvents()));

app.listen(PORT, () => {
  console.log(`Grid webhook server listening on port ${PORT}`);
  console.log(`  POST /webhook   ← Grid deliveries (X-Grid-Signature verified)`);
  console.log(`  GET  /health    ← { "status": "ok" }`);
  console.log(`  GET  /events    ← sanitized received events`);
});
