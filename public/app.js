async function loadStatus() {
  const res = await fetch("/api/status");
  if (!res.ok) {
    throw new Error(`Status request failed with ${res.status}`);
  }
  return res.json();
}

function formatTimestamp(ts) {
  if (!ts) return "–";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "–";
  if (typeof Intl.RelativeTimeFormat === "function") {
    const diffMinutes = Math.round((date.getTime() - Date.now()) / 60000);
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    return `${date.toLocaleString()} (${rtf.format(diffMinutes, "minute")})`;
  }
  return date.toLocaleString();
}

function renderWarnings(container, warnings) {
  container.classList.remove("alert-danger");
  container.classList.add("alert-warning");
  if (!warnings || warnings.length === 0) {
    container.classList.add("d-none");
    container.textContent = "";
    return;
  }
  container.classList.remove("d-none");
  container.innerHTML = warnings
    .map((warning) => `<div>${warning}</div>`)
    .join("\n");
}

function showError(message) {
  const container = document.getElementById("warnings");
  container.classList.remove("d-none", "alert-warning");
  container.classList.add("alert-danger");
  container.textContent = message;
}

function renderSheets(container, sheets) {
  container.innerHTML = "";
  if (!Array.isArray(sheets) || sheets.length === 0) {
    container.innerHTML = '<p class="text-muted">No sheets configured.</p>';
    return;
  }
  const list = document.createElement("div");
  list.className = "list-group";
  sheets.forEach((sheet) => {
    const item = document.createElement("div");
    item.className = "list-group-item";
    item.innerHTML = `
      <div class="d-flex w-100 justify-content-between">
        <h5 class="mb-1">${sheet.title || sheet.id}</h5>
        <small>${sheet.running ? "Running" : "Idle"}</small>
      </div>
      <p class="mb-1 text-muted">Tab: ${sheet.tab} • Mode: ${sheet.mode} • Rows: ${sheet.rowCount}</p>
      <small>Last success: ${formatTimestamp(sheet.lastSuccess)} | Last run: ${formatTimestamp(sheet.lastRun)}${sheet.lastError ? ` | Error: ${sheet.lastError.message}` : ""}</small>
    `;
    list.appendChild(item);
  });
  container.appendChild(list);
}

function renderGoogleAuth(status) {
  const card = document.getElementById("googleAuthCard");
  if (!status?.auth?.google?.enabled || status.auth.google.mode !== "oauth") {
    card.classList.add("d-none");
    return;
  }
  card.classList.remove("d-none");
  const info = status.auth.google;
  const statusEl = document.getElementById("googleAuthStatus");
  statusEl.textContent = info.connected
    ? "Connected to Google Sheets via OAuth."
    : "Not connected. Click Connect to authorise access.";
  const connectBtn = document.getElementById("googleAuthConnect");
  const disconnectBtn = document.getElementById("googleAuthDisconnect");
  connectBtn.disabled = info.connected;
  disconnectBtn.disabled = !info.connected;
}

async function handleGoogleConnect() {
  try {
    const res = await fetch("/api/oauth/google/url");
    if (!res.ok) {
      throw new Error("Failed to start Google authorization");
    }
    const data = await res.json();
    if (!data.url) {
      throw new Error("Authorization URL missing in response");
    }
    window.location.href = data.url;
  } catch (err) {
    showError(err.message);
  }
}

async function handleGoogleDisconnect() {
  try {
    const res = await fetch("/api/oauth/google/revoke", { method: "POST" });
    if (!res.ok) {
      throw new Error("Failed to revoke Google authorization");
    }
    await bootstrap();
  } catch (err) {
    showError(err.message);
  }
}

async function bootstrap() {
  try {
    const status = await loadStatus();
    document.getElementById("globalCron").textContent =
      status.schedule?.globalCron || "Not configured";
    renderWarnings(document.getElementById("warnings"), status.warnings);
    renderSheets(document.getElementById("sheets"), status.sheets);
    renderGoogleAuth(status);
  } catch (err) {
    showError(err.message);
  }
}

function attachEventHandlers() {
  const connectBtn = document.getElementById("googleAuthConnect");
  const disconnectBtn = document.getElementById("googleAuthDisconnect");
  if (connectBtn) {
    connectBtn.addEventListener("click", handleGoogleConnect);
  }
  if (disconnectBtn) {
    disconnectBtn.addEventListener("click", handleGoogleDisconnect);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  attachEventHandlers();
  bootstrap();
});
