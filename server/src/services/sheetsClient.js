import fs from 'node:fs';
import { google } from 'googleapis';
import { env, isSheetsConfigured } from '../env.js';
import { parseGrid } from '../utils/gridParser.js';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

let sheetsApiPromise = null;

function loadCredentials() {
  if (env.googleServiceAccountJson) {
    return JSON.parse(env.googleServiceAccountJson);
  }
  if (env.googleServiceAccountFile) {
    return JSON.parse(fs.readFileSync(env.googleServiceAccountFile, 'utf-8'));
  }
  throw new Error('No Google service account credentials configured');
}

function getSheetsApi() {
  if (!sheetsApiPromise) {
    const credentials = loadCredentials();
    const auth = new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
    sheetsApiPromise = auth.getClient().then((authClient) => google.sheets({ version: 'v4', auth: authClient }));
  }
  return sheetsApiPromise;
}

// Quotes the tab name for A1 notation if it contains spaces or special characters.
function quotedTab() {
  const tab = env.googleSheetTab;
  return /^[A-Za-z0-9_]+$/.test(tab) ? tab : `'${tab.replace(/'/g, "''")}'`;
}

export function columnIndexToLetter(index) {
  let letter = '';
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

// Reads all rows from the configured sheet/tab.
// Returns { headerMap: { field -> colIndex }, headerRow: [...], rows: [{ rowNumber, values: {field: raw} }] }
export async function readSheet({ columns }) {
  if (!isSheetsConfigured) throw new Error('Google Sheets is not configured');
  const sheets = await getSheetsApi();
  const range = `${quotedTab()}!A1:ZZ`;
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: env.googleSheetId,
    range,
  });

  return parseGrid(data.values || [], columns);
}

// Writes a set of {field: value} cells into an existing row, using the same
// column mapping produced by readSheet(). Batches all cells into one request.
export async function writeRowCells({ columns, headerMap, rowNumber, fieldValues }) {
  if (!isSheetsConfigured) return;
  const sheets = await getSheetsApi();

  const data = [];
  for (const col of columns) {
    if (!(col.field in fieldValues)) continue;
    const colIndex = headerMap[col.field];
    if (colIndex === undefined) continue; // column not present in sheet, skip
    const cell = `${quotedTab()}!${columnIndexToLetter(colIndex)}${rowNumber}`;
    data.push({ range: cell, values: [[fieldValues[col.field] ?? '']] });
  }
  if (data.length === 0) return;

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: env.googleSheetId,
    requestBody: { valueInputOption: 'USER_ENTERED', data },
  });
}

// Appends a brand-new row (used for leads created manually in the CRM, not
// sourced from the sheet). Returns the new row number.
export async function appendRow({ columns, headerRow, fieldValues }) {
  if (!isSheetsConfigured) return null;
  const sheets = await getSheetsApi();

  const rowValues = headerRow.map((header) => {
    const col = columns.find((c) => c.header.toLowerCase() === header.toLowerCase());
    if (!col) return '';
    return fieldValues[col.field] ?? '';
  });

  const { data } = await sheets.spreadsheets.values.append({
    spreadsheetId: env.googleSheetId,
    range: `${quotedTab()}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [rowValues] },
  });

  const updatedRange = data.updates?.updatedRange; // e.g. "Leads!A5:M5"
  const match = updatedRange && /![A-Z]+(\d+):/.exec(updatedRange);
  return match ? Number(match[1]) : null;
}
