// Webhook verification & storage test.
//
// Generates a throwaway P-256 keypair, runs the webhook server with that public
// key as the signing key, and asserts:
//   1. an invalid signature is rejected with 401 and nothing is stored,
//   2. a validly-signed event is accepted with 200,
//   3. submitting the same valid event twice leaves only ONE stored record.
//
// Run with:  npm test

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});
const pubPem = publicKey.export({ type: "spki", format: "pem" }).toString().trim();

const PORT = "3099";
const base = `http://localhost:${PORT}`;

const server = spawn("node", ["src/webhook.js"], {
  env: { ...process.env, PORT, LIGHTSPARK_WEBHOOK_SIGNING_KEY: pubPem },
  stdio: ["ignore", "ignore", "inherit"],
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sign(body) {
  const sig = crypto.createSign("SHA256").update(body).end().sign(privateKey);
  return JSON.stringify({ v: "1", s: sig.toString("base64") });
}

const post = (body, signature) =>
  fetch(`${base}/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Grid-Signature": signature },
    body,
  });

try {
  await sleep(1200); // let the server boot

  const body = JSON.stringify({
    id: "evt_test_1",
    type: "TRANSACTION_COMPLETED",
    timestamp: "2026-09-17T00:00:00Z",
    data: { id: "Transaction:test" },
  });

  // 1. Invalid signature → 401, nothing stored.
  const bad = await post(body, "not-a-real-signature");
  assert.equal(bad.status, 401, "invalid signature must return 401");
  let events = await (await fetch(`${base}/events`)).json();
  assert.equal(events.length, 0, "nothing should be stored after a 401");

  // 2. Valid signature → 200.
  const sig = sign(body);
  const ok = await post(body, sig);
  assert.equal(ok.status, 200, "valid signature must return 200");

  // 3. Same event twice → only one stored record.
  await post(body, sig);
  await sleep(300); // allow async storage to settle
  events = await (await fetch(`${base}/events`)).json();
  assert.equal(events.length, 1, "duplicate event must not create a second record");
  assert.equal(events[0].eventId, "evt_test_1");

  console.log("✓ webhook tests passed (401 rejected, 200 accepted, duplicate de-duped)");
} finally {
  server.kill();
}
