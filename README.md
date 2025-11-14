# actual-sync-google-sheets

Sync Actual Budget data to Google Sheets using flexible mappings, scheduled jobs, and real-time updates from `actual-events`.

## Features

- **Config-driven sheets** – declare which Actual data to extract and how to map it into Sheets columns.
- **Multiple sync targets** – pull data from one or more budgets using familiar `ACTUAL_SYNC_ID` / `BACKUP_SYNC_ID` semantics.
- **Scheduler + events** – run on a cron schedule or react to Actual events for near real-time updates.
- **Google Sheets integration** – authenticate with a service account or OAuth (from the built-in UI) and batch update tabs with replace, append, or upsert modes.
- **Status API/UI** – optional web UI to inspect sheet status, recent runs, and errors.

## Quick start

```bash
cp env/actual-sync-google-sheets.env.example env/actual-sync-google-sheets.env
cp config/sheets.example.yml config/sheets.yml
npm install
npm run sync -- --once   # Run all configured sheets once
npm start                # Start scheduler and status server
```

The Docker image includes a `bin/healthcheck.sh` script wired up to the container `HEALTHCHECK` so Compose/Swarm can mark the service unhealthy if the process dies or loses budget/token storage access.

## Configuration

See `env/actual-sync-google-sheets.env.example` for core environment variables and `config/sheets.example.yml` for sheet mapping examples.

### Authentication modes

Set `SHEETS_MODE=service-account` (default) to load credentials from `SHEETS_SERVICE_ACCOUNT_JSON`. This works well for headless deployments where you can safely store the service account JSON alongside `config/sheets.yml`.

Set `SHEETS_MODE=oauth` to authorise via Google OAuth:

1. Populate `SHEETS_OAUTH_CLIENT_ID`, `SHEETS_OAUTH_CLIENT_SECRET`, and `PUBLIC_URL` (must be reachable by your browser, e.g. `https://stack.example.com/sheets`).
2. Launch the service and open the UI. A Google Auth card appears with “Connect Google”.
3. Click “Connect Google” to open the OAuth consent screen. After approving, the callback stores refresh/access tokens in `TOKEN_STORE_PATH` and closes the tab.
4. Use the “Disconnect” button to revoke tokens (they’re removed from disk and revoked at Google).

### Upserts and key columns

Set `mode: upsert` on a sheet to update existing rows rather than clear/append. Provide `keyColumns` (matching your header labels) so the uploader knows how to identify existing rows. The sample `sheets.example.yml` shows an upsert sheet that keys on “Transaction ID”.

### Event-triggered syncs

Enable the Actual event stream via `ENABLE_EVENT_STREAM=true`, `ACTUAL_EVENTS_URL`, and `ACTUAL_EVENTS_TOKEN` (if needed). Each sheet can define an `events` block with `entities`, `types`, and optional `debounceMs`. Incoming events are filtered per sheet and queued with a debounce so you don’t overwhelm the API after large imports.

Example:

```yaml
events:
  entities: transaction
  types: transaction.created,transaction.updated
  debounceMs: 3000
```

Sheets without an `events` block ignore event traffic; cron schedules remain active for all sheets unless `SHEETS_CRON` or per-sheet `cron` are unset.

## Development

- `npm test` – run Jest suites
- `npm run lint` – run ESLint
- `npm run sync` – execute a one-off sync using the loaded configuration

Docker assets and integration into the wider `actual-auto-stack` will follow the existing conventions of sibling projects.
