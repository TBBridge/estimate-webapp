/**
 * Minimal CSV parser (RFC 4180-style quoted fields). UTF-8; strips BOM.
 */
export function stripBom(s: string): string {
  if (s.charCodeAt(0) === 0xfeff) return s.slice(1);
  return s;
}

export function parseCsvRows(text: string): string[][] {
  const s = stripBom(text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"));
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let i = 0;
  let inQuotes = false;

  const pushCell = () => {
    row.push(cur);
    cur = "";
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cur += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      pushCell();
      i += 1;
      continue;
    }
    if (c === "\n") {
      pushCell();
      pushRow();
      i += 1;
      continue;
    }
    cur += c;
    i += 1;
  }
  pushCell();
  if (row.some((cell) => String(cell).trim() !== "")) {
    rows.push(row);
  }

  return rows;
}

/** First row lowercase keys, trim */
export function csvRowsToObjects(matrix: string[][]): Record<string, string>[] {
  if (matrix.length < 2) return [];
  const headers = matrix[0].map((h) => h.trim().toLowerCase());
  const out: Record<string, string>[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const cells = matrix[r];
    if (cells.every((c) => !String(c).trim())) continue;
    const o: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      o[headers[c]] = String(cells[c] ?? "").trim();
    }
    out.push(o);
  }
  return out;
}

export function parseCsv(text: string): Record<string, string>[] {
  return csvRowsToObjects(parseCsvRows(text));
}
