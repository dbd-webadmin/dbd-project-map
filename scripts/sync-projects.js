const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const SHEET_ID = '1nYt3hDQwDLg-2-sobNeKAkrP2nUSIDKfj8PpOKSDKoc';

const HEADERS = [
  'id', 'client', 'state', 'location', 'title', 'contractPeriod',
  'category', 'narrative', 'contactName', 'contactEmail',
  'websiteLink', 'planLink', 'lat', 'lng', 'source', 'notes',
];

async function syncProjects() {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const tabTitle = meta.data.sheets[0].properties.title;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${tabTitle}'!A2:P1000`,
  });

  const rows = response.data.values || [];

  const projects = rows
    .filter(row => row[0] && row[4])
    .map(row => {
      const obj = {};
      HEADERS.forEach((key, i) => {
        obj[key] = (row[i] || '').toString().trim();
      });
      obj.lat = obj.lat ? parseFloat(obj.lat) : null;
      obj.lng = obj.lng ? parseFloat(obj.lng) : null;
      return obj;
    });

  const outDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'projects.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), count: projects.length, projects }, null, 2)
  );

  console.log(`Synced ${projects.length} projects to data/projects.json`);
}

syncProjects().catch(err => {
  console.error(err);
  process.exit(1);
});
