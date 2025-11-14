const WebSocket = require("ws");
const logger = require("./logger");

function createEventSubscriber(config, handleEvent) {
  if (!config.events.enabled || !config.events.url) {
    return {
      start() {
        logger.info("event subscriber disabled");
      },
      stop() {},
    };
  }

  let ws;
  let stopped = false;

  function connect() {
    if (stopped) return;
    ws = new WebSocket(config.events.url, {
      headers: config.events.token
        ? { Authorization: `Bearer ${config.events.token}` }
        : undefined,
    });

    ws.on("open", () => {
      logger.info(
        { url: config.events.url },
        "connected to actual events stream",
      );
    });

    ws.on("message", (data) => {
      try {
        const payload = JSON.parse(data.toString());
        handleEvent(payload);
      } catch (err) {
        logger.warn({ err }, "failed to parse event payload");
      }
    });

    ws.on("close", (code) => {
      logger.warn({ code }, "event stream closed; retrying");
      if (!stopped) {
        setTimeout(connect, 5000);
      }
    });

    ws.on("error", (err) => {
      logger.error({ err }, "event stream error");
      ws.close();
    });
  }

  return {
    start() {
      connect();
    },
    stop() {
      stopped = true;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    },
  };
}

module.exports = {
  createEventSubscriber,
};
