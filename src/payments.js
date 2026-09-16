// Sandbox script: exercises the Lightspark REGTEST test-mode flow end to end.
//
//   1. Authenticates and prints the current node balances.
//   2. Creates a test-mode invoice on our node.
//   3. Loads the node signing key (needed to move funds).
//   4. Simulates an inbound payment that settles the invoice.
//
// Run with:  npm run sandbox
//
// Everything here uses Lightspark "test mode", which only works on
// REGTEST nodes and never touches real bitcoin.

import { createLightsparkClient } from "./client.js";

// Amount to invoice for, in millisatoshis (1 sat = 1000 msats).
const AMOUNT_MSATS = 50_000; // 50 sats
const MEMO = "nicelydone-lightspark-sandbox test invoice";

async function main() {
  const { client, nodeId, nodePassword } = createLightsparkClient();

  console.log("→ Connecting to Lightspark (REGTEST)…");
  console.log(`  node: ${nodeId}\n`);

  // 1. Show current balances so the effect of the payment is visible.
  const account = await client.getCurrentAccount();
  if (account) {
    console.log(`✓ Authenticated as account: ${account.name ?? account.id}`);
  }

  // 2. Create a test-mode invoice on our node.
  console.log(`→ Creating test-mode invoice for ${AMOUNT_MSATS} msats…`);
  const encodedInvoice = await client.createTestModeInvoice(
    nodeId,
    AMOUNT_MSATS,
    MEMO
  );

  if (!encodedInvoice) {
    throw new Error("createTestModeInvoice returned no invoice.");
  }
  console.log(`✓ Invoice created:\n  ${encodedInvoice}\n`);

  // 3. Load the signing key so the node can settle/route the payment.
  if (nodePassword) {
    console.log("→ Loading node signing key…");
    await client.loadNodeSigningKey(nodeId, { password: nodePassword });
    console.log("✓ Signing key loaded.\n");
  } else {
    console.warn(
      "! LIGHTSPARK_NODE_PASSWORD not set — skipping signing key load.\n"
    );
  }

  // 4. Simulate an inbound payment that pays the invoice we just made.
  console.log("→ Simulating inbound test-mode payment…");
  const payment = await client.createTestModePayment(nodeId, encodedInvoice);

  if (payment) {
    console.log("✓ Test-mode payment submitted.");
    console.log(`  payment id:  ${payment.id ?? "(pending)"}`);
    console.log(`  status:      ${payment.status ?? "(pending)"}`);
  }

  console.log(
    "\nDone. Start the webhook server (npm start) to observe the " +
      "resulting payment events as Lightspark delivers them."
  );
}

main().catch((err) => {
  console.error("\n✗ Sandbox run failed:");
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
