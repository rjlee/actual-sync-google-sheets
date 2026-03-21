const logger = require("../logger");

function resolveEnvValue(value) {
  if (typeof value !== "string") return value;
  return value.replace(
    /\$\{env:([^}]+)\}/g,
    (_, key) => process.env[key] || "",
  );
}

function resolveHeaders(headers) {
  if (!headers || typeof headers !== "object") return {};
  const resolved = {};
  for (const [key, value] of Object.entries(headers)) {
    resolved[key] = resolveEnvValue(value);
  }
  return resolved;
}

function getNestedValue(obj, path) {
  if (path === "$" || path === "$.$") return obj;
  const cleanPath = path.replace(/^\$\.?/, "");
  if (!cleanPath) return obj;
  const parts = cleanPath.split(".");
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

async function httpExtractor(context, options = {}) {
  const url = resolveEnvValue(options.url);
  if (!url) {
    throw new Error("http extractor requires 'url' option");
  }

  const headers = resolveHeaders(options.headers || {});
  const extractPath = options.extract || "$";

  logger.info({ url, extractPath }, "Fetching data from HTTP source");

  try {
    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} ${response.statusText}: ${await response.text()}`,
      );
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error(
        `Expected JSON response, got ${contentType}. URL: ${url}`,
      );
    }

    const json = await response.json();
    const data = getNestedValue(json, extractPath);

    if (!Array.isArray(data)) {
      if (typeof data === "object" && data !== null) {
        return [data];
      }
      throw new Error(
        `Extracted value is not an array: ${typeof data}. Use 'extract' option to specify JSONPath to array.`,
      );
    }

    return data;
  } catch (err) {
    if (err.code === "ENOTFOUND" || err.code === "ECONNREFUSED") {
      throw new Error(`Cannot connect to ${url}: ${err.code}`);
    }
    throw err;
  }
}

module.exports = { httpExtractor };
