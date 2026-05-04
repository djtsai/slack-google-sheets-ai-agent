const { google } = require("googleapis");

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

const sheets = google.sheets({ version: "v4", auth: oauth2Client });

async function getSheet(range) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range,
  });

  return res.data.values;
}

async function getSheetByName(name) {
  return getSheet(name);
}

async function findRowByDate(sheetName, cutoffDate) {
  const column = await getSheet(`${sheetName}!A:A`);
  if (!column) return 1;

  const target = new Date(cutoffDate);

  for (let i = 0; i < column.length; i++) {
    const cell = column[i]?.[0];
    if (!cell) continue;
    const date = new Date(cell);
    if (!isNaN(date) && date >= target) {
      return i + 1; // 1-based row number
    }
  }

  return 1;
}

async function getSheetDataFromRow(sheetName, startRow) {
  return getSheet(`${sheetName}!${startRow}:${startRow + 999999}`);
}

async function getSheetNames() {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
  });

  return meta.data.sheets.map((s) => s.properties.title);
}

module.exports = { getSheetByName, findRowByDate, getSheetDataFromRow, getSheetNames };
