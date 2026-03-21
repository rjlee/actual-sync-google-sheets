const { withBudget } = require("../actual-client");
const logger = require("../logger");
const { httpExtractor } = require("./http");

async function balancesExtractor(context) {
  const accounts = await context.api.getAccounts().catch((err) => {
    logger.warn({ err }, "getAccounts failed; returning empty set");
    return [];
  });
  return Promise.all(
    accounts.map(async (account) => {
      let balanceValue =
        typeof account.balance === "number" ? account.balance : 0;
      if (
        typeof account.balance !== "number" ||
        Number.isNaN(account.balance)
      ) {
        try {
          balanceValue = await context.api.getAccountBalance(account.id);
        } catch (error) {
          logger.warn(
            { err: error, accountId: account.id },
            "getAccountBalance failed; falling back to 0",
          );
          balanceValue = 0;
        }
      }
      return {
        accountId: account.id,
        accountName: account.name,
        type: account.type,
        balance: balanceValue,
        offBudget: Boolean(account.offbudget),
        closed: Boolean(account.closed),
      };
    }),
  );
}

async function transactionsExtractor(context, options = {}) {
  const now = new Date();
  const days = Number(options.days || 0);
  const startDate =
    days > 0 ? new Date(now.getTime() - days * 24 * 60 * 60 * 1000) : null;
  const startDateIso = startDate
    ? startDate.toISOString().slice(0, 10)
    : undefined;
  const accountId =
    typeof options.accountId === "string" && options.accountId.length > 0
      ? options.accountId
      : null;

  const transactions = await context.api
    .getTransactions(accountId, startDateIso, undefined)
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
  http: httpExtractor,
};

const EXTRACTORS_REQUIRES_BUDGET = new Set(["balances", "transactions"]);

async function runExtractor(config, sheet) {
  const { source } = sheet;
  const extractor = EXTRACTORS[source.type];
  if (!extractor) {
    throw new Error(`Unsupported source type: ${source.type}`);
  }

  const options = source.options || {};

  if (!EXTRACTORS_REQUIRES_BUDGET.has(source.type)) {
    const data = await extractor(null, options);
    return Array.isArray(data) ? data : [];
  }

  const { resolvedSyncTarget } = sheet;
  return withBudget(config, resolvedSyncTarget, async (context) => {
    const data = await extractor(context, options);
    return Array.isArray(data) ? data : [];
  });
}

module.exports = {
  runExtractor,
};
