const fs = require("fs/promises");
const path = require("path");
const api = require("@actual-app/api");
const logger = require("./logger");

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function resetActualSession() {
  try {
    await api.closeBudget();
  } catch (err) {
    logger.debug({ err }, "closeBudget before init failed");
  }
}

function extractBudgetIdFromDownload(downloadResult) {
  if (typeof downloadResult?.id === "string" && downloadResult.id.length > 0) {
    return downloadResult.id.trim();
  }
  if (
    downloadResult?.id &&
    typeof downloadResult.id.id === "string" &&
    downloadResult.id.id.length > 0
  ) {
    return downloadResult.id.id.trim();
  }
  if (
    typeof downloadResult?.budgetId === "string" &&
    downloadResult.budgetId.length > 0
  ) {
    return downloadResult.budgetId.trim();
  }
  return null;
}

function collectCandidateBudgetIds(syncId, downloadResult, budgets) {
  const raw = [];
  const push = (value) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    raw.push(trimmed);
  };

  push(extractBudgetIdFromDownload(downloadResult));

  if (Array.isArray(budgets) && budgets.length > 0) {
    const byCloud = budgets.find((b) => b?.cloudFileId === syncId)?.id;
    push(byCloud);

    const byId = budgets.find((b) => b?.id === syncId)?.id;
    push(byId);

    budgets.forEach((b) => push(b?.id));
  }

  push(syncId);

  const seen = new Set();
  return raw.filter((candidate) => {
    if (seen.has(candidate)) {
      return false;
    }
    seen.add(candidate);
    return true;
  });
}

async function resolveBudgetResources({
  syncId,
  downloadResult,
  budgets,
  budgetDir,
  targetBudgetId,
}) {
  const candidates = collectCandidateBudgetIds(syncId, downloadResult, budgets);

  if (targetBudgetId && Array.isArray(budgets)) {
    const preferred = budgets
      .filter((entry) => entry?.cloudFileId === targetBudgetId)
      .map((entry) => entry?.id)
      .filter(Boolean)
      .reverse();
    for (const id of preferred) {
      if (!candidates.includes(id)) {
        candidates.unshift(id);
      } else {
        const idx = candidates.indexOf(id);
        candidates.splice(idx, 1);
        candidates.unshift(id);
      }
    }
  }

  for (const candidate of candidates) {
    const dbFile = path.join(budgetDir, candidate, "db.sqlite");
    if (await pathExists(dbFile)) {
      return { budgetId: candidate, dbFile, dbExists: true };
    }
  }

  const localEntries = await fs.readdir(budgetDir).catch(() => []);
  for (const entry of localEntries) {
    const dbFile = path.join(budgetDir, entry, "db.sqlite");
    if (await pathExists(dbFile)) {
      return { budgetId: entry.trim(), dbFile, dbExists: true };
    }
  }

  const fallbackId = candidates[0] || syncId || "budget";
  return {
    budgetId: fallbackId,
    dbFile: path.join(budgetDir, fallbackId, "db.sqlite"),
    dbExists: false,
  };
}

async function withBudget(config, target, callback) {
  await ensureDir(config.actual.budgetDir);
  await resetActualSession();

  await api.init({
    dataDir: config.actual.budgetDir,
    serverURL: config.actual.serverUrl,
    password: config.actual.password,
  });

  const downloadOptions = {};
  if (config.actual.encryptionKey) {
    downloadOptions.password = config.actual.encryptionKey;
  }

  const downloadResult = await api.downloadBudget(
    target.syncId,
    downloadOptions,
  );
  if (downloadResult?.error) {
    throw new Error(
      `downloadBudget failed: ${JSON.stringify(downloadResult.error)}`,
    );
  }

  const budgets = await api.getBudgets().catch((err) => {
    logger.warn({ err }, "getBudgets failed");
    return [];
  });

  const { budgetId } = await resolveBudgetResources({
    syncId: target.syncId,
    downloadResult,
    budgets,
    budgetDir: config.actual.budgetDir,
    targetBudgetId: target.budgetId,
  });

  await api.loadBudget(budgetId);

  try {
    return await callback({ api, budgetId, downloadResult, budgets });
  } finally {
    try {
      await api.shutdown();
    } catch (err) {
      logger.warn({ err }, "failed to shutdown Actual API");
    }
  }
}

module.exports = {
  withBudget,
};
