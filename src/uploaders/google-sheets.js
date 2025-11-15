const fs = require("fs/promises");
const { google } = require("googleapis");
const logger = require("../logger");
const { applyUpsert } = require("./upsert");

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

async function createServiceAccountAuth(config) {
  if (!config.google.serviceAccountPath) {
    throw new Error(
      "SHEETS_SERVICE_ACCOUNT_JSON is required for service-account mode",
    );
  }
  const keyFile = config.google.serviceAccountPath;
  const raw = await fs.readFile(keyFile, "utf8");
  const credentials = JSON.parse(raw);
  if (!credentials.client_email) {
    throw new Error(
      `Service account JSON at ${keyFile} is missing client_email. Download a JSON key from Google Cloud.`,
    );
  }
  if (!credentials.private_key) {
    throw new Error(
      `Service account JSON at ${keyFile} is missing private_key. Download a JSON key from Google Cloud.`,
    );
  }
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    keyFile,
    scopes: SCOPES,
  });
  await auth.authorize();
  return auth;
}

async function createOAuthAuth(config, tokenStore) {
  const clientId = config.google.oauth?.clientId;
  const clientSecret = config.google.oauth?.clientSecret;
  if (!clientId || !clientSecret) {
    throw new Error(
      "OAuth mode requires SHEETS_OAUTH_CLIENT_ID and SHEETS_OAUTH_CLIENT_SECRET",
    );
  }
  if (!tokenStore) {
    throw new Error("Token store is required for OAuth mode");
  }
  const tokens = await tokenStore.get("google");
  if (!tokens) {
    throw new Error(
      "Google Sheets OAuth tokens not found; authorise via the UI",
    );
  }
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials(tokens);
  return oauth2Client;
}

async function createSheetsClient(config, tokenStore) {
  if (!config.google.enabled) {
    throw new Error("Google Sheets uploads are disabled");
  }
  const auth =
    config.google.mode === "oauth"
      ? await createOAuthAuth(config, tokenStore)
      : await createServiceAccountAuth(config);
  return google.sheets({ version: "v4", auth });
}

async function clearAndReplace(sheets, payload) {
  const { spreadsheetId, tab, header, rows, range, clearRange } = payload;
  const targetClearRange = clearRange || tab;
  const writeRange = range || `${tab}!A1`;
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: targetClearRange,
  });
  const values = header ? [header, ...rows] : rows;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: writeRange,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values,
    },
  });
}

async function appendRows(sheets, payload) {
  const { spreadsheetId, tab, rows } = payload;
  const range = payload.range || `${tab}!A1`;
  const values = rows;
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values,
    },
  });
}

async function upsertRows(sheets, payload) {
  if (!Array.isArray(payload.keyColumns) || payload.keyColumns.length === 0) {
    throw new Error("Upsert mode requires keyColumns to be defined");
  }
  const existingValues = await sheets.spreadsheets.values
    .get({
      spreadsheetId: payload.spreadsheetId,
      range: payload.range || `${payload.tab}!A1`,
    })
    .then((res) => res.data?.values || [])
    .catch((err) => {
      logger.warn(
        { err },
        "failed to read existing sheet values, assuming empty sheet",
      );
      return [];
    });
  const values = applyUpsert(
    existingValues,
    payload.header,
    payload.rows,
    payload.keyColumns,
  );
  await sheets.spreadsheets.values.update({
    spreadsheetId: payload.spreadsheetId,
    range: payload.range || `${payload.tab}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values,
    },
  });
}

async function uploadToSheets(config, tokenStore, payload) {
  const sheetsClient = await createSheetsClient(config, tokenStore);
  const mode = (payload.mode || "clear-and-replace").toLowerCase();
  const request = {
    spreadsheetId: payload.spreadsheetId,
    tab: payload.tab,
    header: payload.header,
    rows: payload.rows,
    keyColumns: payload.keyColumns || [],
    range: payload.range || null,
    clearRange: payload.clearRange || null,
  };

  logger.info(
    {
      spreadsheetId: payload.spreadsheetId,
      tab: payload.tab,
      mode,
      rowCount: payload.rows.length,
    },
    "uploading data to google sheets",
  );

  if (mode === "clear-and-replace") {
    await clearAndReplace(sheetsClient, request);
  } else if (mode === "append") {
    await appendRows(sheetsClient, request);
  } else if (mode === "upsert") {
    await upsertRows(sheetsClient, request);
  } else {
    throw new Error(`Unsupported sheets upload mode: ${mode}`);
  }
}

module.exports = {
  uploadToSheets,
  SCOPES,
};
