// Centralized Lightspark client factory.
// Reads credentials from the environment and returns a configured
// LightsparkClient plus the resolved node id, so the rest of the app
// never has to touch process.env directly.

import "dotenv/config";
import {
  LightsparkClient,
  AccountTokenAuthProvider,
} from "@lightsparkdev/lightspark-sdk";

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
 * Build a Lightspark client authenticated with API token credentials.
 * @returns {{ client: LightsparkClient, nodeId: string, nodePassword: string }}
 */
export function createLightsparkClient() {
  const clientId = requireEnv("LIGHTSPARK_API_TOKEN_CLIENT_ID");
  const clientSecret = requireEnv("LIGHTSPARK_API_TOKEN_CLIENT_SECRET");
  const nodeId = requireEnv("LIGHTSPARK_NODE_ID");
  // Node password is only needed when we sign operations (paying invoices).
  const nodePassword = process.env.LIGHTSPARK_NODE_PASSWORD?.trim() ?? "";

  const client = new LightsparkClient(
    new AccountTokenAuthProvider(clientId, clientSecret)
  );

  return { client, nodeId, nodePassword };
}

export default createLightsparkClient;
