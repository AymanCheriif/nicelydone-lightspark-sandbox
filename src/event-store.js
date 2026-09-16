// Tiny append-only event store used by the webhook server.
// Keeps events in memory for fast access and mirrors them to a JSON
// file on disk so they survive a restart. Intentionally dependency-free.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE_PATH = join(__dirname, "..", "events.json");

/** @type {Array<object>} */
let events = [];

// Load any previously persisted events on module init.
if (existsSync(STORE_PATH)) {
  try {
    const raw = readFileSync(STORE_PATH, "utf8");
    events = JSON.parse(raw);
    if (!Array.isArray(events)) events = [];
  } catch {
    // Corrupt or empty file — start fresh rather than crash.
    events = [];
  }
}

function persist() {
  try {
    writeFileSync(STORE_PATH, JSON.stringify(events, null, 2));
  } catch (err) {
    // Persistence is best-effort; never let it take down the webhook.
    console.error("[event-store] failed to persist events:", err.message);
  }
}

/**
 * Append an event and persist to disk.
 * @param {object} event - The parsed Lightspark webhook event.
 * @returns {object} the stored record (event plus a receivedAt timestamp).
 */
export function addEvent(event) {
  const record = { receivedAt: new Date().toISOString(), ...event };
  events.push(record);
  persist();
  return record;
}

/**
 * @returns {Array<object>} a shallow copy of all stored events.
 */
export function getEvents() {
  return [...events];
}

/**
 * @param {string} id - Lightspark event id.
 * @returns {object|undefined}
 */
export function getEventById(id) {
  return events.find((e) => e.event_id === id || e.id === id);
}

/**
 * Clear all stored events (useful in tests / between sandbox runs).
 */
export function clearEvents() {
  events = [];
  persist();
}

export default { addEvent, getEvents, getEventById, clearEvents };
