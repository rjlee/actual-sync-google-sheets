require("dotenv").config();

const fs = require("fs");
const path = require("path");
const yaml = require("yaml");
const invariant = require("tiny-invariant");

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const normalized = value.toString().trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function ensureAbsolute(targetPath, cwd = process.cwd()) {
  if (!targetPath) return null;
  return path.isAbsolute(targetPath) ? targetPath : path.join(cwd, targetPath);
}

function parseSyncTargets(syncId, backupSyncIdsRaw) {
  const sources = [];
  if (backupSyncIdsRaw) {
    const seen = new Set();
    for (const entryRaw of backupSyncIdsRaw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)) {
      const [first, second] = entryRaw.split(":");
      if (typeof second === "undefined") {
        const syncValue = first.trim();
        invariant(syncValue.length > 0, "BACKUP_SYNC_ID entry missing sync id");
        const key = `::${syncValue}`;
        if (seen.has(key)) continue;
        seen.add(key);
        sources.push({ alias: null, budgetId: null, syncId: syncValue });
        continue;
      }
      const budgetId = first.trim();
      const syncValue = second.trim();
      invariant(
        budgetId.length > 0 && syncValue.length > 0,
        "BACKUP_SYNC_ID entries must include both BudgetID and SyncID",
      );
      const key = `${budgetId}::${syncValue}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push({ alias: null, budgetId, syncId: syncValue });
    }
  }

  if (!backupSyncIdsRaw) {
    invariant(syncId, "ACTUAL_SYNC_ID is required");
    sources.push({ alias: null, budgetId: null, syncId });
  }

  invariant(sources.length > 0, "At least one sync target must be defined");
  return sources;
}

function toArray(value) {
  if (!value && value !== 0) return [];
  if (Array.isArray(value)) {
    return value.map((entry) => (entry == null ? "" : String(entry)));
  }
  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const ENV_PATTERN = /\$\{env:([A-Z0-9_]+)\}/gi;

function applyEnvPlaceholders(value, env) {
  if (typeof value === "string") {
    return value.replace(ENV_PATTERN, (_, key) => env[key] ?? "");
  }
  if (Array.isArray(value)) {
    return value.map((item) => applyEnvPlaceholders(item, env));
  }
  if (value && typeof value === "object") {
    const next = {};
    for (const [key, val] of Object.entries(value)) {
      next[key] = applyEnvPlaceholders(val, env);
    }
    return next;
  }
  return value;
}

function loadSheetConfig(configPath, env) {
  if (!configPath) {
    return {
      sheets: [],
      warnings: ["SHEETS_CONFIG_PATH not set; no sheets configured."],
    };
  }
  const resolved = ensureAbsolute(configPath);
  if (!fs.existsSync(resolved)) {
    return {
      sheets: [],
      warnings: [`Sheet config not found at ${resolved}`],
    };
  }
  const raw = fs.readFileSync(resolved, "utf8");
  const parsed = applyEnvPlaceholders(yaml.parse(raw) || {}, env);
  const sheets = Array.isArray(parsed.sheets) ? parsed.sheets : [];
  const normalized = sheets.map((sheet, index) => {
    if (!sheet || typeof sheet !== "object") {
      throw new Error(`Sheet definition at index ${index} must be an object`);
    }
    const id = sheet.id || `sheet-${index + 1}`;
    const spreadsheetId =
      sheet.spreadsheetId || env.SHEETS_DEFAULT_SPREADSHEET_ID || null;
    invariant(spreadsheetId, `Sheet ${id} is missing spreadsheetId`);
    const tab = sheet.tab || "Sheet1";
    const mode = (sheet.mode || "clear-and-replace").toLowerCase();
    const source = sheet.source || {};
    invariant(source.type, `Sheet ${id} is missing source.type`);
    const transform = sheet.transform || { columns: [] };
    invariant(
      Array.isArray(transform.columns) && transform.columns.length > 0,
      `Sheet ${id} must define at least one transform column`,
    );
    const syncTarget = sheet.syncTarget || "default";
    const keyColumns = Array.isArray(sheet.keyColumns)
      ? sheet.keyColumns.map((column) => String(column))
      : [];
    if ((sheet.mode || "clear-and-replace").toLowerCase() === "upsert") {
      invariant(
        keyColumns.length > 0,
        `Sheet ${id} uses upsert mode but does not define keyColumns`,
      );
    }
    const events = sheet.events
      ? (() => {
          let debounce = null;
          if (typeof sheet.events.debounceMs === "number") {
            debounce = Number.isFinite(sheet.events.debounceMs)
              ? sheet.events.debounceMs
              : null;
          } else if (typeof sheet.events.debounceMs === "string") {
            const parsed = Number(sheet.events.debounceMs);
            debounce = Number.isFinite(parsed) ? parsed : null;
          }
          return {
            entities: toArray(sheet.events.entities),
            types: toArray(sheet.events.types),
            debounceMs: debounce,
          };
        })()
      : null;
    const title = sheet.title || id;
    return {
      ...sheet,
      id,
      title,
      spreadsheetId,
      tab,
      mode,
      syncTarget,
      source,
      transform,
      keyColumns,
      events,
      range: sheet.range || null,
      clearRange: sheet.clearRange || null,
    };
  });

  return { sheets: normalized, warnings: [] };
}

function normaliseCron(cron) {
  const value = (cron || "").trim();
  return value.length > 0 ? value : null;
}

function loadConfig() {
  const serverUrl = process.env.ACTUAL_SERVER_URL;
  const password = process.env.ACTUAL_PASSWORD;
  const syncId = process.env.ACTUAL_SYNC_ID;
  const backupSyncIdsRaw = process.env.BACKUP_SYNC_ID;

  invariant(serverUrl, "ACTUAL_SERVER_URL is required");
  invariant(password, "ACTUAL_PASSWORD is required");

  const syncTargets = parseSyncTargets(syncId, backupSyncIdsRaw);
  const primarySyncId = syncTargets[0].syncId;

  const sheetsConfigPath =
    process.env.SHEETS_CONFIG_PATH ||
    path.join(process.cwd(), "config", "sheets.yml");
  const { sheets, warnings } = loadSheetConfig(sheetsConfigPath, process.env);

  const sheetTargetAliases = new Map();
  sheetTargetAliases.set("default", syncTargets[0]);
  for (const target of syncTargets) {
    sheetTargetAliases.set(target.syncId, target);
    if (target.alias) {
      sheetTargetAliases.set(target.alias, target);
    }
  }

  const scheduledSheets = sheets.map((sheet) => {
    const target =
      sheetTargetAliases.get(sheet.syncTarget) ||
      sheetTargetAliases.get("default");
    if (!target) {
      throw new Error(
        `Sheet ${sheet.id} references unknown sync target ${sheet.syncTarget}`,
      );
    }
    return {
      ...sheet,
      resolvedSyncTarget: target,
      cron: normaliseCron(sheet.cron) || null,
    };
  });

  const budgetDir = ensureAbsolute(
    process.env.BUDGET_DIR || path.join(process.cwd(), "data", "budget"),
  );
  const tokenStorePath = ensureAbsolute(
    process.env.TOKEN_STORE_PATH || path.join(process.cwd(), "data", "tokens"),
  );

  return {
    runtime: {
      warnings,
    },
    actual: {
      serverUrl,
      password,
      syncTargets,
      syncId: primarySyncId,
      syncIds: Array.from(new Set(syncTargets.map((target) => target.syncId))),
      encryptionKey: process.env.ACTUAL_BUDGET_ENCRYPTION_PASSWORD || null,
      budgetDir,
    },
    sheets: {
      configPath: ensureAbsolute(sheetsConfigPath),
      entries: scheduledSheets,
      defaultSpreadsheetId: process.env.SHEETS_DEFAULT_SPREADSHEET_ID || null,
    },
    google: {
      enabled: bool(process.env.ENABLE_SHEETS, true),
      mode: (process.env.SHEETS_MODE || "service-account").toLowerCase(),
      serviceAccountPath: ensureAbsolute(
        process.env.SHEETS_SERVICE_ACCOUNT_JSON,
      ),
      oauth: {
        clientId: process.env.SHEETS_OAUTH_CLIENT_ID || null,
        clientSecret: process.env.SHEETS_OAUTH_CLIENT_SECRET || null,
      },
    },
    schedule: {
      cron: normaliseCron(process.env.SHEETS_CRON || "0 3 * * *"),
      once: process.argv.includes("--once") || process.argv.includes("--sync"),
    },
    events: {
      enabled: bool(process.env.ENABLE_EVENT_STREAM, false),
      url: process.env.ACTUAL_EVENTS_URL || null,
      token: process.env.ACTUAL_EVENTS_TOKEN || null,
      debounceMs: (() => {
        const parsed = parseInt(process.env.EVENT_DEBOUNCE_MS || "5000", 10);
        return Number.isFinite(parsed) ? parsed : 5000;
      })(),
    },
    http: {
      port: parseInt(process.env.HTTP_PORT || "4020", 10),
      publicUrl:
        process.env.PUBLIC_URL ||
        `http://localhost:${process.env.HTTP_PORT || "4020"}`,
    },
    tokens: {
      path: tokenStorePath,
    },
  };
}

module.exports = loadConfig;
