// Sandbox script: exercises the Lightspark Grid REGTEST/sandbox lifecycle
// end to end and prints structured JSON at each step.
//
//   1. Read platform config + supported currencies.
//   2. Fund the platform's internal account (three labeled funding operations).
//   3. Review balances.
//   4. Create + execute three quotes ("invoices") and print quote/payment/status.
//   5. Run three negative cases (invalid quote, over-balance, duplicate execute).
//   6. List the resulting transactions.
//
// Run with:  npm run sandbox
//
// Everything runs against the Grid sandbox environment — no real money moves.

import {
  createGridClient,
  getPrimaryInternalAccount,
  getInternalAccountById,
} from "./client.js";

const CURRENCY = "USD"; // amounts are in the smallest unit (cents)

// Three labeled funding operations (amount in cents).
const FUNDING_OPS = [
  { amount: 200_000, label: "Initial sandbox liquidity" },
  { amount: 75_000, label: "Refund reserve" },
  { amount: 25_000, label: "Webhook verification" },
];

// Three copy-ready "invoice" examples (amount in cents).
const INVOICES = [
  { amount: 20_000, description: "Acme onboarding fee" },
  { amount: 12_500, description: "Northstar design review" },
  { amount: 7_500, description: "Brightline support credit" },
];

const log = (label, value) =>
  console.log(`\n=== ${label} ===\n${JSON.stringify(value, null, 2)}`);

/** Extract a readable reason from a Grid SDK error. */
const reasonOf = (err) =>
  err?.error?.reason || err?.error?.message || err?.message || String(err);

async function main() {
  const { client, baseURL } = createGridClient({ role: "payments" });
  console.log(`→ Lightspark Grid sandbox: ${baseURL}\n`);

  // 1. Platform config.
  const config = await client.config.retrieve();
  log("Platform config", {
    platformId: config.id,
    appName: config.embeddedWalletConfig?.appName,
    supportedCurrencies: (config.supportedCurrencies ?? []).map((c) => c.currencyCode),
  });

  // 2. Fund the internal account. A platform may have several internal accounts
  // (one per currency) returned in a non-deterministic order, so we pin to a
  // single USD account by id and fund/send from that exact account throughout.
  const account = await getPrimaryInternalAccount(client, { currency: CURRENCY });
  const accountId = account.id;
  log("Internal account (before funding)", {
    id: accountId,
    balance: account.balance,
  });

  for (const op of FUNDING_OPS) {
    const funded = await client.sandbox.internalAccounts.fund(accountId, {
      amount: op.amount,
    });
    log(`Funding: ${op.label}`, {
      amount: op.amount,
      currency: CURRENCY,
      newBalance: funded.balance?.amount,
    });
  }

  // 3. Review balances (re-fetch the same account by id, not by list order).
  const afterFunding = await getInternalAccountById(client, accountId);
  log("Internal account (after funding)", {
    id: accountId,
    availableBalance: afterFunding?.balance,
  });

  // 4. Create + execute three quotes ("invoices").
  const results = [];
  for (const inv of INVOICES) {
    const outcome = { description: inv.description, amount: inv.amount };
    try {
      const quote = await client.quotes.create({
        source: { sourceType: "ACCOUNT", accountId: account.id },
        destination: { destinationType: "ACCOUNT", accountId: account.id },
        lockedCurrencyAmount: inv.amount,
        lockedCurrencySide: "SENDING",
        description: inv.description,
      });
      outcome.quoteId = quote.id;
      outcome.quoteStatus = quote.status;

      const executed = await client.quotes.execute(quote.id);
      outcome.paymentStatus = executed.status;
      outcome.transactionId = executed.transactionId ?? null;
      outcome.totalSendingAmount = executed.totalSendingAmount;
      outcome.failureReason = null;
    } catch (err) {
      outcome.paymentStatus = "FAILED";
      outcome.failureReason = reasonOf(err);
    }
    log(`Invoice → payment: ${inv.description}`, outcome);
    results.push(outcome);
  }

  // 5. Negative cases.
  const negatives = [];

  // (a) Invalid quote id.
  try {
    await client.quotes.execute("Quote:00000000-0000-0000-0000-000000000000");
    negatives.push({ case: "invalid quote id", result: "unexpectedly succeeded" });
  } catch (err) {
    negatives.push({ case: "invalid quote id", rejected: true, reason: reasonOf(err) });
  }

  // (b) Payment larger than the available balance.
  try {
    const huge = await client.quotes.create({
      source: { sourceType: "ACCOUNT", accountId: account.id },
      destination: { destinationType: "ACCOUNT", accountId: account.id },
      lockedCurrencyAmount: 999_999_999,
      lockedCurrencySide: "SENDING",
      description: "Over-balance payment (negative test)",
    });
    const exec = await client.quotes.execute(huge.id);
    negatives.push({
      case: "over-balance payment",
      quoteId: huge.id,
      result: exec.status,
    });
  } catch (err) {
    negatives.push({ case: "over-balance payment", rejected: true, reason: reasonOf(err) });
  }

  // (c) Duplicate execution of the same quote. Grid does not reject this the way
  // paying a Lightning invoice twice would, so we report the actual outcome of
  // both attempts rather than asserting a rejection.
  try {
    const dupQuote = await client.quotes.create({
      source: { sourceType: "ACCOUNT", accountId: account.id },
      destination: { destinationType: "ACCOUNT", accountId: account.id },
      lockedCurrencyAmount: 1_000,
      lockedCurrencySide: "SENDING",
      description: "Duplicate execute (negative test)",
    });
    const first = await client.quotes.execute(dupQuote.id);
    let second;
    try {
      const exec2 = await client.quotes.execute(dupQuote.id);
      second = { status: exec2.status, transactionId: exec2.transactionId, rejected: false };
    } catch (err) {
      second = { rejected: true, reason: reasonOf(err) };
    }
    negatives.push({
      case: "duplicate execute",
      quoteId: dupQuote.id,
      firstAttempt: { status: first.status, transactionId: first.transactionId },
      secondAttempt: second,
    });
  } catch (err) {
    negatives.push({ case: "duplicate execute", rejected: true, reason: reasonOf(err) });
  }

  log("Negative cases", negatives);

  // 6. List transactions.
  const txPage = await client.transactions.list({ limit: 10 });
  const txs = txPage.data ?? [];
  log("Recent transactions", {
    count: txs.length,
    transactions: txs.map((t) => ({ id: t.id, status: t.status })),
  });

  log("Summary", {
    funded: FUNDING_OPS.reduce((s, o) => s + o.amount, 0),
    payments: results.map((r) => ({
      description: r.description,
      status: r.paymentStatus,
      transactionId: r.transactionId,
    })),
    negativeCasesRejected: negatives.filter((n) => n.rejected).length,
  });

  console.log("\n✓ Sandbox lifecycle complete.");
}

main().catch((err) => {
  console.error("\n✗ Sandbox run failed:");
  console.error(reasonOf(err));
  process.exitCode = 1;
});
