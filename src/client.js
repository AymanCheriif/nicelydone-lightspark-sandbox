// Centralized Lightspark Grid client factory.
//
// Grid is a REST API (base https://api.lightspark.com/grid/<version>) accessed
// with HTTP Basic auth (client id = username, client secret = password). Tokens
// are scoped to an environment (sandbox vs production); these are sandbox tokens.
//
// This module reads credentials from the environment and returns a configured
// `LightsparkGrid` client, so the rest of the app never touches process.env.

import "dotenv/config";
import LightsparkGrid from "@lightsparkdev/grid";

export const DEFAULT_BASE_URL = "https://api.lightspark.com/grid/2025-10-13";

// Each named token from the dashboard maps to its own env var pair.
const ROLE_ENV = {
  payments: ["LIGHTSPARK_API_TOKEN_CLIENT_ID", "LIGHTSPARK_API_TOKEN_CLIENT_SECRET"],
  webhooks: ["WEBHOOKS_API_TOKEN_CLIENT_ID", "WEBHOOKS_API_TOKEN_CLIENT_SECRET"],
  reconciliation: [
    "RECONCILIATION_API_TOKEN_CLIENT_ID",
    "RECONCILIATION_API_TOKEN_CLIENT_SECRET",
  ],
};

/**
 * Read a required environment variable or throw a clear error.
 * @param {string} name
 * @returns {string}
 */
function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable "${name}". ` +
        `Copy .env.example to .env and fill it in.`
    );
  }
  return value.trim();
}

/**
 * Build a Grid client authenticated with one of the named token pairs.
 * @param {{ role?: "payments" | "webhooks" | "reconciliation" }} [opts]
 * @returns {{ client: LightsparkGrid, baseURL: string, role: string }}
 */
export function createGridClient({ role = "payments" } = {}) {
  const [idKey, secretKey] = ROLE_ENV[role] ?? ROLE_ENV.payments;
  const username = requireEnv(idKey);
  const password = requireEnv(secretKey);
  const baseURL = (process.env.GRID_API_BASE_URL || DEFAULT_BASE_URL).trim();

  const client = new LightsparkGrid({ username, password, baseURL });
  return { client, baseURL, role };
}

/**
 * Fetch the platform's primary internal account (the wallet we fund and send from).
 * @param {LightsparkGrid} client
 * @returns {Promise<import("@lightsparkdev/grid").LightsparkGrid.InternalAccount>}
 */
export async function getPrimaryInternalAccount(client) {
  const res = await client.platform.listInternalAccounts();
  const accounts = res.data ?? [];
  if (accounts.length === 0) {
    throw new Error("No internal accounts found on this Grid platform.");
  }
  return accounts[0];
}

export default createGridClient;
