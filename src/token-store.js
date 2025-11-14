const fs = require("fs/promises");
const path = require("path");
const logger = require("./logger");

class TokenStore {
  constructor(basePath) {
    this.basePath = basePath || path.join(process.cwd(), "data", "tokens");
  }

  async init() {
    await fs.mkdir(this.basePath, { recursive: true });
  }

  pathFor(key) {
    return path.join(this.basePath, `${key}.json`);
  }

  async has(key) {
    try {
      await fs.access(this.pathFor(key));
      return true;
    } catch {
      return false;
    }
  }

  async get(key) {
    try {
      const raw = await fs.readFile(this.pathFor(key), "utf8");
      return JSON.parse(raw);
    } catch (err) {
      if (err && err.code === "ENOENT") {
        return null;
      }
      logger.warn({ err, key }, "token store read failed");
      throw err;
    }
  }

  async set(key, value) {
    const filePath = this.pathFor(key);
    await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
  }

  async clear(key) {
    try {
      await fs.unlink(this.pathFor(key));
    } catch (err) {
      if (!(err && err.code === "ENOENT")) {
        logger.warn({ err, key }, "token store delete failed");
      }
    }
  }
}

module.exports = TokenStore;
