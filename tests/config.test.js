const fs = require("fs");
const path = require("path");

describe("config loader", () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
    jest.resetModules();
  });

  test("parses minimal configuration", () => {
    process.env.ACTUAL_SERVER_URL = "https://example.com";
    process.env.ACTUAL_PASSWORD = "secret";
    process.env.ACTUAL_SYNC_ID = "sync-123";
    process.env.SHEETS_CONFIG_PATH = path.join(
      __dirname,
      "fixtures",
      "sheets.yml",
    );
    const fixturesDir = path.join(__dirname, "fixtures");
    fs.mkdirSync(fixturesDir, { recursive: true });
    fs.writeFileSync(
      path.join(fixturesDir, "sheets.yml"),
      `sheets:\n  - id: sample\n    spreadsheetId: test\n    tab: Sample\n    source:\n      type: balances\n    transform:\n      columns:\n        - label: Account\n          value: accountName\n`,
    );

    const loadConfig = require("../src/config");
    const config = loadConfig();
    expect(config.actual.syncId).toBe("sync-123");
    expect(config.sheets.entries).toHaveLength(1);
    expect(config.sheets.entries[0].id).toBe("sample");
  });

  test("parses sheet key columns and events", () => {
    process.env.ACTUAL_SERVER_URL = "https://example.com";
    process.env.ACTUAL_PASSWORD = "secret";
    process.env.ACTUAL_SYNC_ID = "sync-456";
    const fixturesDir = path.join(__dirname, "fixtures");
    fs.mkdirSync(fixturesDir, { recursive: true });
    fs.writeFileSync(
      path.join(fixturesDir, "sheets-events.yml"),
      `sheets:
  - id: tx
    spreadsheetId: sheet
    tab: Transactions
    mode: upsert
    keyColumns:
      - Transaction ID
    source:
      type: transactions
    transform:
      columns:
        - label: Transaction ID
          value: transactionId
        - label: Amount
          value: amount
    events:
      entities: transaction
      types: transaction.created,transaction.updated
      debounceMs: 2000
`,
    );
    process.env.SHEETS_CONFIG_PATH = path.join(
      fixturesDir,
      "sheets-events.yml",
    );

    const loadConfig = require("../src/config");
    const config = loadConfig();
    const [sheet] = config.sheets.entries;
    expect(sheet.mode).toBe("upsert");
    expect(sheet.keyColumns).toEqual(["Transaction ID"]);
    expect(sheet.events).toEqual({
      entities: ["transaction"],
      types: ["transaction.created", "transaction.updated"],
      debounceMs: 2000,
    });
  });
});
