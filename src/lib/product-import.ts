export interface ProductImportRow {
  locationId: string;
  name: string;
  description?: string | null;
  category?: string | null;
  price?: number | null;
  currency?: string | null;
  imageUrl?: string | null;
}

/** Parse CSV text into product rows. Header: locationId,locationName,name,category,description,price,currency,imageUrl */
export function parseProductCsv(text: string): { rows: Record<string, string>[]; errors: string[] } {
  const errors: string[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim());
  if (lines.length < 2) {
    return { rows: [], errors: ["CSV must include a header row and at least one product row"] };
  }

  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const required = ["name"];
  for (const col of required) {
    if (!header.includes(col)) errors.push(`Missing required column: ${col}`);
  }
  if (errors.length) return { rows: [], errors };

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    if (cells.every((c) => !c.trim())) continue;
    const row: Record<string, string> = {};
    header.forEach((key, idx) => {
      row[key] = (cells[idx] ?? "").trim();
    });
    if (!row.name?.trim()) {
      errors.push(`Row ${i + 1}: product name is required`);
      continue;
    }
    rows.push(row);
  }

  return { rows, errors };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

export function parsePrice(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const n = parseFloat(raw.replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}
