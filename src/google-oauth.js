const { google } = require("googleapis");
const logger = require("./logger");
const { SCOPES } = require("./uploaders/google-sheets");

function createGoogleOAuthManager(config, tokenStore) {
  if (!config.google.enabled || config.google.mode !== "oauth") {
    return null;
  }
  if (!tokenStore) {
    throw new Error("Token store is required for Google OAuth mode");
  }
  const clientId = config.google.oauth?.clientId || null;
  const clientSecret = config.google.oauth?.clientSecret || null;
  if (!clientId || !clientSecret) {
    throw new Error(
      "SHEETS_OAUTH_CLIENT_ID and SHEETS_OAUTH_CLIENT_SECRET must be set for OAuth mode",
    );
  }

  function getRedirectUri() {
    try {
      const base = new URL(config.http.publicUrl);
      const existingPath = base.pathname || "/";
      const trimmed =
        existingPath.endsWith("/") && existingPath !== "/"
          ? existingPath.slice(0, -1)
          : existingPath;
      const prefix = trimmed === "/" ? "" : trimmed;
      base.pathname = `${prefix}/oauth/google/callback`.replace(/\/{2,}/g, "/");
      base.search = "";
      base.hash = "";
      return base.toString();
    } catch (err) {
      throw new Error(`Invalid PUBLIC_URL for OAuth redirect: ${err.message}`);
    }
  }

  function createClient() {
    return new google.auth.OAuth2(clientId, clientSecret, getRedirectUri());
  }

  async function generateAuthUrl() {
    const client = createClient();
    return client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: SCOPES,
    });
  }

  async function handleCallback(code) {
    if (!code) {
      throw new Error("Missing OAuth code");
    }
    const client = createClient();
    const { tokens } = await client.getToken(code);
    await tokenStore.set("google", tokens);
    logger.info("stored Google Sheets OAuth tokens");
    return tokens;
  }

  async function revokeTokens() {
    const tokens = await tokenStore.get("google");
    if (!tokens) {
      return false;
    }
    const client = createClient();
    client.setCredentials(tokens);
    const revoke = async (token) => {
      if (!token) return;
      try {
        await client.revokeToken(token);
      } catch (err) {
        logger.warn({ err }, "failed to revoke Google token");
      }
    };
    await revoke(tokens.refresh_token);
    await revoke(tokens.access_token);
    await tokenStore.clear("google");
    return true;
  }

  return {
    getRedirectUri,
    generateAuthUrl,
    handleCallback,
    revokeTokens,
  };
}

module.exports = {
  createGoogleOAuthManager,
};
