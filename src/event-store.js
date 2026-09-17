// Tiny append-only event store used by the webhook server.
// Keeps events in memory for fast access and mirrors them to a JSON file so
// they survive a restart. Records are sanitized: no signatures or credentials.

import { readFileSync, existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE_PATH = join(__dirname, "..", "events.json");

/** @type {Array<object>} */
let events = [];

// Load any previously persisted events on module init.
if (existsSync(STORE_PATH)) {
  try {
    const parsed = JSON.parse(readFileSync(STORE_PATH, "utf8"));
    events = Array.isArray(parsed) ? parsed : [];
  } catch {
    events = []; // Corrupt/empty file — start fresh rather than crash.
  }
}

async function persist() {
  // Async, non-blocking write. Callers that must guarantee durability before
  // acknowledging a webhook should `await saveEvent(...)`.
  await writeFile(STORE_PATH, JSON.stringify(events, null, 2));
}

/**
 * Reduce a raw Grid webhook event to a safe, compact record.
 * Grid events look like: { id, type, timestamp, data: { id, ... } }.
 * @param {object} event
 * @returns {{ eventId: string, type: string, entityId: string|null, timestamp: string, receivedAt: string }}
 */
function sanitize(event) {
  return {
    eventId: event?.id ?? null,
    type: event?.type ?? null,
    entityId: event?.data?.id ?? event?.data?.transactionId ?? null,
    timestamp: event?.timestamp ?? null,
    receivedAt: new Date().toISOString(),
  };
}

/**
 * Append a webhook event, de-duplicated by its event id. Returns the stored
 * record, or the existing one if this event id was already seen.
 * @param {object} event - The parsed Grid webhook event.
 * @returns {Promise<{ record: object, duplicate: boolean }>}
 */
export async function saveEvent(event) {
  const record = sanitize(event);
  if (record.eventId) {
    const existing = events.find((e) => e.eventId === record.eventId);
    if (existing) return { record: existing, duplicate: true };
  }
  events.push(record);
  await persist();
  return { record, duplicate: false };
}

/**
 * @returns {Array<object>} a shallow copy of all stored (sanitized) events.
 */
export function listEvents() {
  return [...events];
}

/** Clear all stored events (useful in tests / between sandbox runs). */
export async function clearEvents() {
  events = [];
  await persist();
}

export default { saveEvent, listEvents, clearEvents };
