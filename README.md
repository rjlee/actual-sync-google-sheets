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
cp examples/balances-summary.yml config/sheets.yml
npm install
npm run sync -- --once   # Run all configured sheets once
npm start                # Start scheduler and status server
```

The Docker image includes a `bin/healthcheck.sh` script wired up to the container `HEALTHCHECK` so Compose/Swarm can mark the service unhealthy if the process dies or loses budget/token storage access.

## Configuration

See `env/actual-sync-google-sheets.env.example` for core environment variables and the `examples/` directory for sheet mapping samples. If you only want the automation to touch part of a sheet (so you can keep manual columns), set `clearRange` and `range` per sheet:

```yaml
tab: Summary
clearRange: "Summary!A:D" # wipe only columns the sync controls
range: "Summary!A1" # write starting cell
```

Anything outside `clearRange` is preserved on refresh.

### Authentication modes

Set `SHEETS_MODE=service-account` (default) to load credentials from `SHEETS_SERVICE_ACCOUNT_JSON`. Create a service account in Google Cloud, delegate it access to the target Sheets, and download the JSON key (Service accounts → Keys → “Add key” → JSON). Mount that file into the container (for example under `/app/credentials/service-account.json`) and point `SHEETS_SERVICE_ACCOUNT_JSON` at the mounted path. This mode works well for headless deployments where you can safely store the JSON alongside `config/sheets.yml`.

Set `SHEETS_MODE=oauth` to authorise via Google OAuth:

1. Create a Google Cloud project + OAuth “Web application” client:
   - Add an authorized redirect URI pointing at your public URL plus `/oauth/google/callback` (Traefik users: `https://stack.example.com/sheets/oauth/google/callback`).
   - Copy the Client ID/Secret into `SHEETS_OAUTH_CLIENT_ID` / `SHEETS_OAUTH_CLIENT_SECRET`.
2. Ensure `PUBLIC_URL` reflects how the UI is reached externally (e.g. `https://stack.example.com/sheets`). The app uses it to build the callback URL.
3. Set `SHEETS_MODE=oauth`, restart the service, and visit the UI. A Google Auth card appears with “Connect Google”.
4. Click “Connect Google” to open the consent screen. Approving the prompt stores refresh/access tokens under `TOKEN_STORE_PATH` and closes the tab.
5. Use “Disconnect” if you need to revoke tokens (they’re removed locally and revoked via the Google API).

### Upserts and key columns

Set `mode: upsert` on a sheet to update existing rows rather than clear/append. Provide `keyColumns` (matching your header labels) so the uploader knows how to identify existing rows. The sample `examples/recent-transactions-upsert.yml` shows an upsert sheet that keys on “Transaction ID”.

### Closed accounts

The balances extractor exposes `offBudget` and `closed` booleans. Add a column such as:

```yaml
transform:
  columns:
    # …
  filter: "(not closed) and offBudget"
```

`filter` accepts expression strings using the same syntax as column expressions, so helper functions like `coalesce` are available. Every sheet run also injects `syncStartedAt` (a `Date`), `syncStartedAtIso` (ISO string), and `syncTimestamp` (milliseconds since epoch) into the transform context, so you can stamp the sync time without relying on Google’s volatile formulas:

```yaml
- label: Last Updated
  value: "${formatDate(syncStartedAt, 'yyyy-MM-dd HH:mm')}"
```

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
- `npm run sync -- --sheet-all` – execute a one-off sync of every sheet (add `--dry-run` to log rows without updating Google)
- `npm run sync -- --sheet balances` – run a specific sheet by id (also accepts `--dry-run`)

Docker assets and integration into the wider `actual-auto-stack` will follow the existing conventions of sibling projects.
