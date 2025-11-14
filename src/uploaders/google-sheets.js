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
  const raw = await fs.readFile(config.google.serviceAccountPath, "utf8");
  const credentials = JSON.parse(raw);
  const auth = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    SCOPES,
  );
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
  const { spreadsheetId, tab, header, rows } = payload;
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: tab,
  });
  const values = header ? [header, ...rows] : rows;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: tab,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values,
    },
  });
}

async function appendRows(sheets, payload) {
  const { spreadsheetId, tab, rows } = payload;
  const values = rows;
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: tab,
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
      range: payload.tab,
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
    range: payload.tab,
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
