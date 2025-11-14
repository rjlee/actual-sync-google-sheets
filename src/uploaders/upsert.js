function resolveColumnIndexes(header, keyColumns) {
  if (!Array.isArray(header) || header.length === 0) {
    throw new Error("Upsert mode requires a header row");
  }
  if (!Array.isArray(keyColumns) || keyColumns.length === 0) {
    throw new Error("Upsert mode requires keyColumns to be defined");
  }
  return keyColumns.map((column) => {
    const idx = header.findIndex((label) => label === column);
    if (idx === -1) {
      throw new Error(`Upsert key column not found in header: ${column}`);
    }
    return idx;
  });
}

function buildKey(row, indexes) {
  return indexes.map((idx) => row?.[idx] ?? "").join("::");
}

function normalizeExistingValues(existingValues) {
  if (!Array.isArray(existingValues)) {
    return [];
  }
  return existingValues.map((row) => (Array.isArray(row) ? [...row] : []));
}

function applyUpsert(existingValues, header, rows, keyColumns) {
  const values = normalizeExistingValues(existingValues);
  const normalizedHeader = Array.isArray(header) ? [...header] : [];
  if (normalizedHeader.length === 0) {
    throw new Error("Upsert mode requires a header row");
  }
  if (values.length === 0) {
    values.push(normalizedHeader);
  } else {
    values[0] = normalizedHeader;
  }
  const indexes = resolveColumnIndexes(normalizedHeader, keyColumns);
  const rowMap = new Map();
  for (let i = 1; i < values.length; i += 1) {
    const row = values[i];
    const key = buildKey(row, indexes);
    if (key.length > 0) {
      rowMap.set(key, i);
    }
  }
  for (const row of rows) {
    const key = buildKey(row, indexes);
    if (key.length === 0) {
      continue;
    }
    if (rowMap.has(key)) {
      values[rowMap.get(key)] = row;
    } else {
      values.push(row);
      rowMap.set(key, values.length - 1);
    }
  }
  return values;
}

module.exports = {
  applyUpsert,
};
