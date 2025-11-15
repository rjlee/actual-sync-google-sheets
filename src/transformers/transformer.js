const { Parser } = require("expr-eval");
const helpers = require("./helpers");
const logger = require("../logger");

const parser = new Parser({ allowMemberAccess: true });

function evaluateValue(definition, record) {
  if (definition === null || definition === undefined) {
    return "";
  }
  if (typeof definition === "function") {
    return definition(record, helpers);
  }
  if (typeof definition === "string") {
    const trimmed = definition.trim();
    if (trimmed.startsWith("${") && trimmed.endsWith("}")) {
      const expression = trimmed.slice(2, -1);
      try {
        const context = { ...helpers };
        for (const [key, value] of Object.entries(record || {})) {
          if (value === undefined || value === null) {
            context[key] = 0;
          } else {
            context[key] = value;
          }
        }
        return parser.evaluate(expression, context);
      } catch (err) {
        logger.warn(
          { err, expression, record },
          "failed to evaluate transform expression",
        );
        return "";
      }
    }
    if (trimmed.startsWith("=")) {
      return trimmed;
    }
    if (Object.prototype.hasOwnProperty.call(record, definition)) {
      return record[definition];
    }
    return definition;
  }
  return definition;
}

function transformRecords(transformConfig, records) {
  const columns = Array.isArray(transformConfig?.columns)
    ? transformConfig.columns
    : [];
  if (columns.length === 0) {
    return [];
  }

  const rows = records.map((record) => {
    const values = columns.map((columnDef) => {
      const value = evaluateValue(columnDef.value, record);
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
