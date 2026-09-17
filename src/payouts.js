// Payouts script — sends outgoing payments (payouts) from the platform's
// internal account to an external recipient account, and demonstrates the
// customer-payout path as a best-effort second step.
//
// Run with:  npm run payout
//
// Permissions note: creating recipients (external accounts / customers) needs a
// token with MANAGE; sending the payout needs a token with TRANSACT. In this
// project the Payments token is VIEW+TRANSACT and the Webhooks/Reconciliation
// tokens are VIEW+MANAGE — so we use a MANAGE client to set up the recipient
// and the TRANSACT client to move the funds.

import { createGridClient, getPrimaryInternalAccount } from "./client.js";

const CURRENCY = "USD";
const PAYOUT_AMOUNT = 10_000; // cents

const log = (label, value) =>
  console.log(`\n=== ${label} ===\n${JSON.stringify(value, null, 2)}`);
const reasonOf = (err) =>
  err?.error?.reason || err?.error?.message || err?.message || String(err);

// A USD external account payload (sandbox test bank details).
function usdExternalAccount(platformAccountId, fullName) {
  return {
    currency: CURRENCY,
    platformAccountId,
    accountInfo: {
      accountType: "USD_ACCOUNT",
      accountNumber: "12345678901",
      routingNumber: "021000021",
      beneficiary: { beneficiaryType: "INDIVIDUAL", fullName },
    },
  };
}

async function platformPayout(mgmt, pay) {
  // Ensure the platform's USD internal account has enough balance.
  const source = await getPrimaryInternalAccount(pay, { currency: CURRENCY });
  if ((source.balance?.amount ?? 0) < PAYOUT_AMOUNT) {
    await pay.sandbox.internalAccounts.fund(source.id, { amount: 200_000 });
  }

  // Create the recipient (platform external account) with a MANAGE token.
  const recipient = await mgmt.platform.externalAccounts.create(
    usdExternalAccount(`platform-payout-${Date.now()}`, "Platform Vendor")
  );

  // Send the payout with a TRANSACT token.
  const payout = await pay.transferOut.create({
    source: { accountId: source.id },
    destination: { accountId: recipient.id },
    amount: PAYOUT_AMOUNT,
  });

  return {
    sourceAccount: source.id,
    recipientAccount: recipient.id,
    payoutId: payout.id,
    status: payout.status,
    direction: payout.direction,
    amount: payout.sentAmount?.amount ?? PAYOUT_AMOUNT,
  };
}

async function customerPayout(mgmt, pay) {
  // Create a customer and their external account (MANAGE token).
  const customer = await mgmt.customers.create({
    CreateCustomerRequest: {
      customerType: "INDIVIDUAL",
      fullName: "Jane Payee",
      email: "jane@nicelydone.club",
      currencies: [CURRENCY],
      platformCustomerId: `cust-jane-${Date.now()}`,
    },
  });

  // Pick the customer's USD internal account and fund it.
  const accts = await mgmt.customers.listInternalAccounts(customer.id);
  const usd = (accts.data ?? [])
    .filter((a) => a.balance?.currency?.code === CURRENCY)
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!usd) throw new Error("customer has no USD internal account yet");
  await pay.sandbox.internalAccounts.fund(usd.id, { amount: 50_000 });

  const recipient = await mgmt.customers.externalAccounts.create({
    customerId: customer.id,
    ...usdExternalAccount(`jane-ext-${Date.now()}`, "Jane Payee"),
  });

  const payout = await pay.transferOut.create({
    source: { accountId: usd.id },
    destination: { accountId: recipient.id },
    amount: 5_000,
  });

  return {
    customerId: customer.id,
    sourceAccount: usd.id,
    recipientAccount: recipient.id,
    payoutId: payout.id,
    status: payout.status,
    direction: payout.direction,
  };
}

async function main() {
  const { client: mgmt, baseURL } = createGridClient({ role: "reconciliation" }); // MANAGE
  const { client: pay } = createGridClient({ role: "payments" }); // TRANSACT
  console.log(`→ Grid payouts sandbox: ${baseURL}\n`);

  // Platform payout (reliable).
  try {
    const result = await platformPayout(mgmt, pay);
    log("Platform payout", result);
  } catch (err) {
    log("Platform payout FAILED", { reason: reasonOf(err) });
  }

  // Customer payout (best-effort; account provisioning can lag in sandbox).
  try {
    const result = await customerPayout(mgmt, pay);
    log("Customer payout", result);
  } catch (err) {
    log("Customer payout skipped", { reason: reasonOf(err) });
  }

  // Show recent outgoing (DEBIT) transactions — these are the payouts.
  const txPage = await pay.transactions.list({ limit: 10 });
  const debits = (txPage.data ?? []).filter((t) => t.direction === "DEBIT");
  log("Recent payouts (DEBIT transactions)", {
    count: debits.length,
    payouts: debits.map((t) => ({
      id: t.id,
      status: t.status,
      amount: t.sentAmount?.amount ?? null,
    })),
  });

  console.log("\n✓ Payout run complete.");
}

main().catch((err) => {
  console.error("\n✗ Payout run failed:");
  console.error(reasonOf(err));
  process.exitCode = 1;
});
