// Reconciliation script — uses the "Sandbox Reconciliation" token to read the
// platform's internal-account balance and recent transactions, then prints a
// compact reconciliation comparing the current balance against transaction
// totals (credits in, debits out).
//
// Run with:  npm run reconcile
//
// This is a read-only view (the token only needs View permission).

import { createGridClient, getPrimaryInternalAccount } from "./client.js";

const CURRENCY = "USD";

async function main() {
  const { client, baseURL } = createGridClient({ role: "reconciliation" });
  console.log(`→ Reconciliation via Grid sandbox: ${baseURL}\n`);

  // Current balance of the primary internal account.
  const account = await getPrimaryInternalAccount(client, { currency: CURRENCY });
  const currentBalance = account.balance?.amount ?? 0;

  // Walk all transactions (auto-paginates) and tally by direction.
  let count = 0;
  let totalCredits = 0; // funds into the account
  let totalDebits = 0; // funds out of the account
  let totalFees = 0;
  const byStatus = {};

  for await (const tx of client.transactions.list({ limit: 100 })) {
    count += 1;
    byStatus[tx.status] = (byStatus[tx.status] ?? 0) + 1;
    // Only settled (COMPLETED) transactions move money — pending/expired/failed
    // quotes leave records but must not count toward the reconciled totals.
    if (tx.status !== "COMPLETED") continue;
    totalFees += tx.fees ?? 0;
    if (tx.direction === "CREDIT") {
      totalCredits += tx.receivedAmount?.amount ?? tx.receivedAmount ?? 0;
    } else if (tx.direction === "DEBIT") {
      totalDebits += tx.sentAmount?.amount ?? tx.sentAmount ?? 0;
    }
  }

  const netMovement = totalCredits - totalDebits;

  const report = {
    currency: CURRENCY,
    account: account.id,
    currentBalance,
    transactionCount: count,
    totalCredits,
    totalDebits,
    totalFees,
    netMovement,
    statusBreakdown: byStatus,
    note:
      "Balance is set by sandbox funding plus settled transactions; funding " +
      "operations are not themselves transactions, so currentBalance need not " +
      "equal netMovement. This report is a signal, not a strict ledger equality.",
  };

  console.log(JSON.stringify(report, null, 2));
  console.log("\n✓ Reconciliation complete.");
}

main().catch((err) => {
  console.error("\n✗ Reconciliation failed:");
  console.error(err?.error?.reason || err?.message || String(err));
  process.exitCode = 1;
});
