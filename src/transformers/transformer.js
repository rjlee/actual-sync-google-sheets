const { Parser } = require("expr-eval");
const helpers = require("./helpers");
const logger = require("../logger");

const parser = new Parser({ allowMemberAccess: true });

function buildContext(record, globals = {}) {
  const context = { ...helpers, ...globals };
  for (const [key, value] of Object.entries(record || {})) {
    if (value === undefined || value === null) {
      context[key] = 0;
    } else {
      context[key] = value;
    }
  }
  return context;
}

function ensureVariables(expression, context) {
  if (!expression?.variables) {
    return context;
  }
  const enriched = { ...context };
  for (const variable of expression.variables()) {
    if (Object.prototype.hasOwnProperty.call(enriched, variable)) continue;
    enriched[variable] = 0;
  }
  return enriched;
}

function evaluateParserExpression(expression, record, globals) {
  try {
    const exprAst =
      typeof expression === "string" ? parser.parse(expression) : expression;
    const context = ensureVariables(exprAst, buildContext(record, globals));
    return exprAst.evaluate(context);
  } catch (err) {
    logger.warn(
      { err, expression, record },
      "failed to evaluate transform expression",
    );
    return null;
  }
}

function evaluateValue(definition, record, globals) {
  if (definition === null || definition === undefined) {
    return "";
  }
  if (typeof definition === "function") {
    return definition(record, helpers, globals);
  }
  if (typeof definition === "string") {
    const trimmed = definition.trim();
    if (trimmed.startsWith("${") && trimmed.endsWith("}")) {
      const expression = trimmed.slice(2, -1);
      const result = evaluateParserExpression(expression, record, globals);
      return result === null || result === undefined ? "" : result;
    }
    if (trimmed.startsWith("=")) {
      return trimmed;
    }
    if (Object.prototype.hasOwnProperty.call(record || {}, trimmed)) {
      const value = record[trimmed];
      return value === undefined || value === null ? "" : value;
    }
    return trimmed;
  }
  return definition;
}

function evaluateFilter(filterDef, record, globals) {
  if (filterDef === null || filterDef === undefined) {
    return true;
  }
  if (typeof filterDef === "function") {
    try {
      return Boolean(filterDef(record, helpers, globals));
    } catch (err) {
      logger.warn({ err, record }, "transform filter function threw");
      return false;
    }
  }
  if (typeof filterDef === "string") {
    const trimmed = filterDef.trim();
    if (trimmed.length === 0) return true;
    const expression =
      trimmed.startsWith("${") && trimmed.endsWith("}")
        ? trimmed.slice(2, -1)
        : trimmed;
    const result = evaluateParserExpression(expression, record, globals);
    return Boolean(result);
  }
  return Boolean(filterDef);
}

function transformRecords(transformConfig, records, options = {}) {
  const columns = Array.isArray(transformConfig?.columns)
    ? transformConfig.columns
    : [];
  if (columns.length === 0) {
    return [];
  }

  const globals = options?.context || {};

  const filtered =
    typeof transformConfig?.filter === "undefined"
      ? records
      : records.filter((record) =>
          evaluateFilter(transformConfig.filter, record, globals),
        );

  const rows = filtered.map((record) => {
    const values = columns.map((columnDef) => {
      const value = evaluateValue(columnDef.value, record, globals);
      return value === undefined || value === null ? "" : value;
    });
    return values;
  });

  let processedRows = rows;
  if (transformConfig?.postProcess?.sortBy) {
    const sortRules = Array.isArray(transformConfig.postProcess.sortBy)
      ? transformConfig.postProcess.sortBy
      : [transformConfig.postProcess.sortBy];
    processedRows = [...processedRows].sort((a, b) => {
      for (const rule of sortRules) {
        if (!rule || !rule.column) continue;
        const columnIndex = columns.findIndex(
          (columnDef) =>
            columnDef.label === rule.column || columnDef.value === rule.column,
        );
        if (columnIndex === -1) continue;
        const dir = (rule.direction || "asc").toLowerCase();
        const left = a[columnIndex];
        const right = b[columnIndex];
        if (left === right) continue;
        if (dir === "desc") {
          return left < right ? 1 : -1;
        }
        return left > right ? 1 : -1;
      }
      return 0;
    });
  }

  return {
    header: columns.map(
      (columnDef) => columnDef.label || columnDef.value || "",
    ),
    rows: processedRows,
  };
}

module.exports = {
  transformRecords,
};
