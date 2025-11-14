const { DateTimeFormat } = Intl;

function formatDate(value, format = "yyyy-MM-dd", locale = undefined) {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date?.getTime?.())) {
    return "";
  }
  if (format === "iso" || format === "ISO") {
    return date.toISOString();
  }
  // fallback to Intl API for common tokens
  const options = {};
  if (format.includes("yyyy")) options.year = "numeric";
  if (format.includes("MM"))
    options.month = format.includes("MMM") ? "short" : "2-digit";
  if (format.includes("dd")) options.day = "2-digit";
  if (format.includes("HH")) options.hour = "2-digit";
  if (format.includes("mm")) options.minute = "2-digit";
  if (format.includes("ss")) options.second = "2-digit";
  return new DateTimeFormat(locale, options).format(date);
}

function coalesce(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return "";
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

module.exports = {
  formatDate,
  coalesce,
  toNumber,
};
