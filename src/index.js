const cron = require("node-cron");
const loadConfig = require("./config");
const logger = require("./logger");
const { runExtractor } = require("./extractors");
const { transformRecords } = require("./transformers/transformer");
const { uploadToSheets } = require("./uploaders/google-sheets");
const TokenStore = require("./token-store");
const { startServer } = require("./server");
const { createEventSubscriber } = require("./event-subscriber");

async function main() {
  const config = loadConfig();
  const tokenStore = new TokenStore(config.tokens.path);
  await tokenStore.init();

  const sheetState = new Map();
  const scheduledJobs = [];
  const eventTimers = new Map();

  function getOrCreateState(sheetId) {
    if (!sheetState.has(sheetId)) {
      sheetState.set(sheetId, {
        running: false,
        lastRun: null,
        lastSuccess: null,
        lastError: null,
        rowCount: 0,
      });
    }
    return sheetState.get(sheetId);
  }

  async function runSheet(sheet) {
    const state = getOrCreateState(sheet.id);
    if (state.running) {
      logger.warn(
        { sheetId: sheet.id },
        "sheet sync already running; skipping",
      );
      return;
    }

    state.running = true;
    state.lastRun = Date.now();
    state.lastError = null;
    try {
      const records = await runExtractor(config, sheet);
      const transformed = transformRecords(sheet.transform, records);
      if (config.google.enabled) {
        await uploadToSheets(config, tokenStore, {
          spreadsheetId: sheet.spreadsheetId,
          tab: sheet.tab,
          header: transformed.header,
          rows: transformed.rows,
          mode: sheet.mode,
          keyColumns: sheet.keyColumns,
        });
      } else {
        logger.info(
          { sheetId: sheet.id },
          "Google Sheets disabled; skipping upload",
        );
      }
      state.lastSuccess = Date.now();
      state.rowCount = transformed.rows.length;
      logger.info(
        { sheetId: sheet.id, rows: transformed.rows.length },
        "sheet sync complete",
      );
    } catch (err) {
      state.lastError = {
        message: err.message,
        timestamp: Date.now(),
      };
      logger.error({ err, sheetId: sheet.id }, "sheet sync failed");
      throw err;
    } finally {
      state.running = false;
    }
  }

  async function runAllSheets() {
    const failures = [];
    for (const sheet of config.sheets.entries) {
      try {
        await runSheet(sheet);
      } catch (err) {
        failures.push({ sheetId: sheet.id, err });
      }
    }
    if (failures.length > 0) {
      const failedIds = failures.map((failure) => failure.sheetId).join(", ");
      const error = new Error(`One or more sheets failed: ${failedIds}`);
      error.failures = failures;
      throw error;
    }
  }

  function scheduleSheetFromEvent(sheet, event) {
    const debounceMs =
      sheet.events?.debounceMs ?? config.events.debounceMs ?? 5000;
    if (eventTimers.has(sheet.id)) {
      clearTimeout(eventTimers.get(sheet.id));
    }
    logger.info(
      { sheetId: sheet.id, debounceMs, eventType: event?.type },
      "queuing sheet sync from event stream",
    );
    const timer = setTimeout(() => {
      eventTimers.delete(sheet.id);
      runSheet(sheet).catch(() => {
        // individual sheet logs the error; ignore here
      });
    }, debounceMs);
    eventTimers.set(sheet.id, timer);
  }

  function matchesEventConfig(eventConfig, event) {
    if (!eventConfig) return false;
    if (
      eventConfig.entities?.length > 0 &&
      !eventConfig.entities.includes(event.entity)
    ) {
      return false;
    }
    if (
      eventConfig.types?.length > 0 &&
      !eventConfig.types.includes(event.type)
    ) {
      return false;
    }
    return true;
  }

  const runtime = {
    async getStatus() {
      const sheets = config.sheets.entries.map((sheet) => {
        const state = getOrCreateState(sheet.id);
        return {
          id: sheet.id,
          title: sheet.title,
          spreadsheetId: sheet.spreadsheetId,
          tab: sheet.tab,
          mode: sheet.mode,
          running: state.running,
          lastRun: state.lastRun,
          lastSuccess: state.lastSuccess,
          lastError: state.lastError,
          rowCount: state.rowCount,
        };
      });
      const googleConnected =
        config.google.mode === "oauth"
          ? await tokenStore.has("google")
          : config.google.enabled;
      return {
        warnings: config.runtime.warnings,
        schedule: {
          globalCron: config.schedule.cron,
        },
        auth: {
          google: {
            mode: config.google.mode,
            enabled: config.google.enabled,
            connected: googleConnected,
          },
        },
        sheets,
      };
    },
    async triggerSheet(sheetId) {
      const sheet = config.sheets.entries.find((entry) => entry.id === sheetId);
      if (!sheet) {
        throw new Error(`Sheet not found: ${sheetId}`);
      }
      await runSheet(sheet);
    },
    async triggerAll() {
      await runAllSheets();
    },
  };

  if (config.schedule.cron && !config.schedule.once) {
    const job = cron.schedule(config.schedule.cron, () => {
      logger.info({ cron: config.schedule.cron }, "running scheduled sync");
      runAllSheets().catch((err) => {
        logger.error({ err }, "scheduled sync failed");
      });
    });
    scheduledJobs.push(job);
  }

  for (const sheet of config.sheets.entries) {
    if (sheet.cron && !config.schedule.once) {
      const job = cron.schedule(sheet.cron, () => {
        logger.info(
          { sheetId: sheet.id, cron: sheet.cron },
          "running sheet-specific schedule",
        );
        runSheet(sheet).catch((err) => {
          logger.error(
            { err, sheetId: sheet.id },
            "sheet-specific schedule failed",
          );
        });
      });
      scheduledJobs.push(job);
    }
  }

  const eventSubscriber = createEventSubscriber(config, (event) => {
    let matched = false;
    for (const sheet of config.sheets.entries) {
      if (!sheet.events) continue;
      if (!matchesEventConfig(sheet.events, event)) continue;
      matched = true;
      scheduleSheetFromEvent(sheet, event);
    }
    if (!matched) {
      logger.debug(
        { eventType: event?.type },
        "event ignored (no sheet subscriptions matched)",
      );
    }
  });
  eventSubscriber.start();

  await startServer(config, runtime, { tokenStore });

  if (config.schedule.once) {
    await runtime.triggerAll();
    process.exit(0);
  }

  process.on("SIGINT", () => {
    logger.info("received SIGINT, shutting down");
    scheduledJobs.forEach((job) => job.stop());
    eventTimers.forEach((timer) => clearTimeout(timer));
    eventTimers.clear();
    eventSubscriber.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    logger.info("received SIGTERM, shutting down");
    scheduledJobs.forEach((job) => job.stop());
    eventTimers.forEach((timer) => clearTimeout(timer));
    eventTimers.clear();
    eventSubscriber.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.fatal({ err }, "fatal error starting service");
  process.exit(1);
});
