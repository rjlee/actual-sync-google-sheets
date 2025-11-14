# Sheet Config Examples

This directory contains ready-to-use sample `config/sheets.yml` fragments. Copy the file that matches your use case into `config/sheets.yml` (or merge multiple sheets together) and update the `spreadsheetId`, tab names, and cron schedules to suit your environment.

- `balances-summary.yml` – Clears + replaces a summary tab with the latest account balances.
- `recent-transactions-upsert.yml` – Upserts recent transactions keyed by `Transaction ID` so rows update in place when Actual changes.

Each example uses `${env:SHEETS_DEFAULT_SPREADSHEET_ID}` placeholders so you can keep the spreadsheet id in `.env`. The Config loader resolves these placeholders automatically.
