const { withBudget } = require("../actual-client");
const logger = require("../logger");

async function balancesExtractor(context) {
  const accounts = await context.api.getAccounts().catch((err) => {
    logger.warn({ err }, "getAccounts failed; returning empty set");
    return [];
  });
  return accounts.map((account) => ({
    accountId: account.id,
    accountName: account.name,
    type: account.type,
    balance: account.balance,
    offBudget: Boolean(account.offbudget),
  }));
}

async function transactionsExtractor(context, options = {}) {
  const now = new Date();
  const days = Number(options.days || 0);
  const startDate =
    days > 0 ? new Date(now.getTime() - days * 24 * 60 * 60 * 1000) : null;
  const includeScheduled = Boolean(options.includeScheduled);

  const params = {};
  if (startDate) {
    params.startDate = startDate.toISOString().slice(0, 10);
  }
  if (!includeScheduled) {
    params.filterScheduled = true;
  }

  const transactions = await context.api
    .getTransactions(params)
    .catch((err) => {
      logger.warn({ err }, "getTransactions failed; returning empty set");
      return [];
    });

  return transactions.map((txn) => ({
    transactionId: txn.id,
    date: txn.date,
    amount: txn.amount,
    payee: txn.payee_name || txn.payee,
    category: txn.category_name || txn.category,
    memo: txn.memo || "",
    accountId: txn.account_id,
  }));
}

const EXTRACTORS = {
  balances: balancesExtractor,
  transactions: transactionsExtractor,
};

async function runExtractor(config, sheet) {
  const { resolvedSyncTarget, source } = sheet;
  return withBudget(config, resolvedSyncTarget, async (context) => {
    const extractor = EXTRACTORS[source.type];
    if (!extractor) {
      throw new Error(`Unsupported source type: ${source.type}`);
    }
    const data = await extractor(context, source.options || {});
    return Array.isArray(data) ? data : [];
  });
}

module.exports = {
  runExtractor,
};
