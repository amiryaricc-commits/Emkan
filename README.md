<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/d3b7edc4-d36c-4c45-bb02-900a91764189

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Run with Docker

From the parent `Emkan` directory, build and start the updated app from
`Emkan v 1.2` (the older `FaraPay` folder is not used):

```bash
docker compose build emkan-web
docker compose up -d emkan-web
```

The production image serves the built static app on port `8090`. After source
changes, rebuild and restart it with:

```bash
docker compose up -d --build emkan-web
```

The development dependencies and source tree are not mounted into the running
web container.

## Import Hesabfa data

In **Settings → Excel import/export**, download the three sample workbooks for
contacts, products, and sales invoices. Replace their example rows with your
Hesabfa data while keeping the column headers unchanged. The converter reads
the first worksheet in each workbook and currently supports one product line
per invoice. Remove all `DEMO-*` rows before converting real data.

Select the three `.xlsx` files directly in the import screen and choose **Read
files and create preview**. The workbooks are read locally in the browser and
are not uploaded. Review the preview before confirming. Imported sales invoices
are historical archive records and do not create accounting entries or change
stock. A pre-converted JSON file can still be selected as an alternative.
Recreate the downloadable sample workbooks after changing their expected
columns with:

```bash
python3 scripts/create_hesabfa_excel_templates.py
```

## Browser data

Application records are stored in browser IndexedDB. Existing localStorage
arrays are migrated on first load; the original localStorage values are kept
unchanged as a recovery copy. When two tabs edit the same record collection at
once, the stale write is rejected and the newer saved state is reloaded instead
of silently overwriting it. Export regular backups from the app: browser storage
is still local to that browser profile and is not a substitute for a shared
server database.
