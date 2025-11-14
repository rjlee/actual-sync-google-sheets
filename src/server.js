const express = require("express");
const path = require("path");
const logger = require("./logger");
const { createGoogleOAuthManager } = require("./google-oauth");

function createServer(config, runtime, options = {}) {
  const app = express();
  app.use(express.json());

  const publicDir = path.join(__dirname, "..", "public");
  app.use(express.static(publicDir));

  app.get("/api/status", async (req, res) => {
    const status = await runtime.getStatus();
    res.json(status);
  });

  app.post("/api/sheets/:id/run", async (req, res) => {
    try {
      await runtime.triggerSheet(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, "manual sheet trigger failed");
      res.status(500).json({ error: err.message || "Sync failed" });
    }
  });

  app.post("/api/run", async (req, res) => {
    try {
      await runtime.triggerAll();
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, "manual full sync failed");
      res.status(500).json({ error: err.message || "Sync failed" });
    }
  });

  const oauth = createGoogleOAuthManager(config, options.tokenStore);
  if (oauth) {
    app.get("/api/oauth/google/url", async (req, res) => {
      try {
        const url = await oauth.generateAuthUrl();
        res.json({ url });
      } catch (err) {
        logger.error({ err }, "failed to create google auth url");
        res.status(500).json({ error: "Failed to create auth URL" });
      }
    });

    app.post("/api/oauth/google/revoke", async (req, res) => {
      try {
        const revoked = await oauth.revokeTokens();
        res.json({ ok: true, revoked });
      } catch (err) {
        logger.error({ err }, "failed to revoke google tokens");
        res.status(500).json({ error: "Failed to revoke tokens" });
      }
    });

    app.get("/oauth/google/callback", async (req, res) => {
      const { code, error: oauthError } = req.query;
      if (oauthError) {
        logger.warn({ error: oauthError }, "google oauth returned error");
        res
          .status(400)
          .send("Google authorization was denied. You can close this tab.");
        return;
      }
      try {
        await oauth.handleCallback(code);
        res.send(
          "<html><body><p>Google Sheets connected. You can close this window.</p><script>window.close && window.close();</script></body></html>",
        );
      } catch (err) {
        logger.error({ err }, "google oauth callback failed");
        res
          .status(500)
          .send(
            "Failed to complete Google authorization. Check logs for details.",
          );
      }
    });
  }

  return app;
}

function startServer(config, runtime, options) {
  const app = createServer(config, runtime, options);
  return new Promise((resolve) => {
    const server = app.listen(config.http.port, () => {
      logger.info({ port: config.http.port }, "status server listening");
      resolve(server);
    });
  });
}

module.exports = {
  createServer,
  startServer,
};
