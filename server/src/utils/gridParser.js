// Turns a raw 2D grid (row 0 = headers) into the {headerMap, rows} shape the
// import logic consumes. Shared by the Google Sheets reader and the
// spreadsheet-upload importer so both follow identical column-matching,
// blank-row-skipping, and trimming rules.
export function parseGrid(grid, columns) {
  const headerRow = (grid[0] || []).map((h) => String(h ?? '').trim());

  const headerMap = {};
  for (const col of columns) {
    const idx = headerRow.findIndex((h) => h.toLowerCase() === col.header.toLowerCase());
    if (idx !== -1) headerMap[col.field] = idx;
  }

  const rows = [];
  let blankSkipped = 0;
  for (let i = 1; i < grid.length; i++) {
    const rawRow = grid[i] || [];
    const isBlank = rawRow.every((cell) => String(cell ?? '').trim() === '');
    if (isBlank) {
      blankSkipped++;
      continue;
    }

    const values = {};
    for (const col of columns) {
      const idx = headerMap[col.field];
      values[col.field] = idx !== undefined ? String(rawRow[idx] ?? '').trim() : '';
    }
    rows.push({ rowNumber: i + 1, values }); // +1 for 1-indexed, header is row 1
  }

  return { headerMap, headerRow, rows, blankSkipped };
}
