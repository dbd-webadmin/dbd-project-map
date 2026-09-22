# DBD Project Map

Interactive map of every Destination by Design project, filterable by category, with a toggleable
name/location label overlay and a one-click PNG export for use in proposals.

## How it works

- **Data source:** the "DBD Project Map - Master List" Google Sheet (324 projects, one row per unique
  departmental project). `scripts/sync-projects.js` pulls it via the Sheets API (same
  `GOOGLE_CREDENTIALS` service account used by `dbd-webmaster-agent` / `dbd-marketing-dashboard`) and
  writes `data/projects.json`. Runs daily via `.github/workflows/sync-projects.yml`, or trigger manually
  from the Actions tab.
- **Frontend:** static HTML/CSS/JS, Leaflet.js for the map (dark CartoDB basemap), `html2canvas` for
  PNG export. No build step.
- **Hosting:** GitHub Pages, deployed via `.github/workflows/pages-deploy.yml` on every push to `main`.

## Known gap: geocoding

Most rows in the Master List don't have Latitude/Longitude yet — the sheet has empty `Latitude` /
`Longitude` columns pending a geocoding pass over the `Location`/`State` fields. Until those are filled
in, most pins won't render (the sidebar shows "N mapped" so you can see coverage). Filling in
Lat/Lng directly in the Sheet is enough — no code change needed, the next sync will pick it up.

## Local dev

Just open `index.html` in a browser, or serve the folder statically:

```
npx serve .
```

To manually pull fresh data locally you'll need a copy of the `GOOGLE_CREDENTIALS` service account
JSON as an env var:

```
GOOGLE_CREDENTIALS='...' npm run sync
```
