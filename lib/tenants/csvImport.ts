/**
 * CSV-Bulk-Import-Parser für Mieter.
 *
 * Header (case-insensitive, ; oder , als Separator):
 *   unit_label, last_name, first_name, email, phone,
 *   lease_start, lease_end, cold_rent_eur, additional_costs_eur,
 *   deposit_eur, rent_type
 *
 * EUR-Felder werden zu Cents konvertiert (`x.xx` oder `x,xx` akzeptiert).
 * Diese Funktion ist pure — sie löst nicht `unit_label` zu UUIDs auf, das
 * passiert in der API-Route.
 */

export type TenantCsvParsedRow = {
  unit_label: string;
  last_name: string;
  first_name: string;
  email: string | null;
  phone: string | null;
  lease_start: string;
  lease_end: string | null;
  cold_rent_cents: number;
  additional_costs_cents: number | null;
  deposit_cents: number | null;
  rent_type: "fixed" | "index" | "stepped";
};

export type TenantCsvParseError = {
  row_index: number; // 1-indexed (1 = erste Datenzeile, ohne Header)
  raw: Record<string, string>;
  message: string;
};

export type TenantCsvParseResult = {
  ok: TenantCsvParsedRow[];
  errors: TenantCsvParseError[];
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RENT_TYPES = new Set(["fixed", "index", "stepped"]);

/** Wandelt "12,34" oder "12.34" in 1234 Cents (half-up). */
function eurToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Tausendertrennzeichen entfernen (sowohl . als auch ,) — aber nur, wenn es
  // sich um ein Tausendertrennzeichen handelt. Heuristik: letzter , oder .
  // ist das Dezimaltrennzeichen.
  const lastComma = trimmed.lastIndexOf(",");
  const lastDot = trimmed.lastIndexOf(".");
  let normalized: string;
  if (lastComma === -1 && lastDot === -1) {
    normalized = trimmed;
  } else if (lastComma > lastDot) {
    // Komma als Dezimal: Punkte raus, Komma → Punkt
    normalized = trimmed.replace(/\./g, "").replace(",", ".");
  } else {
    // Punkt als Dezimal: Kommas raus
    normalized = trimmed.replace(/,/g, "");
  }
  const num = Number(normalized);
  if (!Number.isFinite(num)) return null;
  // Half-up
  return num >= 0 ? Math.floor(num * 100 + 0.5) : -Math.floor(-num * 100 + 0.5);
}

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === sep) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseTenantsCsv(
  csv: string,
  options?: { defaultRentType?: "fixed" | "index" | "stepped" },
): TenantCsvParseResult {
  const ok: TenantCsvParsedRow[] = [];
  const errors: TenantCsvParseError[] = [];
  const defaultRentType = options?.defaultRentType ?? "fixed";

  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { ok, errors };

  const sep = lines[0].includes(";") ? ";" : ",";
  const headers = splitCsvLine(lines[0], sep).map((h) => h.toLowerCase());

  const idxOf = (...candidates: string[]): number => {
    for (const c of candidates) {
      const idx = headers.indexOf(c);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const idx = {
    unit_label: idxOf("unit_label", "einheit", "bezeichnung"),
    last_name: idxOf("last_name", "nachname"),
    first_name: idxOf("first_name", "vorname"),
    email: idxOf("email", "e-mail"),
    phone: idxOf("phone", "telefon"),
    lease_start: idxOf("lease_start", "mietbeginn"),
    lease_end: idxOf("lease_end", "mietende"),
    cold_rent_eur: idxOf("cold_rent_eur", "kaltmiete_eur", "kaltmiete"),
    additional_costs_eur: idxOf("additional_costs_eur", "nk_eur", "nebenkosten_eur"),
    deposit_eur: idxOf("deposit_eur", "kaution_eur", "kaution"),
    rent_type: idxOf("rent_type", "miettyp"),
  };

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i], sep);
    const get = (j: number) => (j >= 0 ? (cols[j] ?? "").trim() : "");
    const raw: Record<string, string> = {};
    Object.entries(idx).forEach(([k, j]) => {
      raw[k] = get(j);
    });

    const rowNum = i;
    const unit_label = get(idx.unit_label);
    const last_name = get(idx.last_name);
    const first_name = get(idx.first_name);
    const lease_start = get(idx.lease_start);
    const cold_rent_eur_raw = get(idx.cold_rent_eur);
    const lease_end_raw = get(idx.lease_end);
    const rent_type_raw = get(idx.rent_type).toLowerCase();

    if (!unit_label) {
      errors.push({ row_index: rowNum, raw, message: "unit_label fehlt" });
      continue;
    }
    if (!last_name || !first_name) {
      errors.push({ row_index: rowNum, raw, message: "last_name oder first_name fehlt" });
      continue;
    }
    if (!ISO_DATE_RE.test(lease_start)) {
      errors.push({
        row_index: rowNum,
        raw,
        message: `lease_start muss ISO YYYY-MM-DD sein, war: '${lease_start}'`,
      });
      continue;
    }
    let lease_end: string | null = null;
    if (lease_end_raw) {
      if (!ISO_DATE_RE.test(lease_end_raw)) {
        errors.push({
          row_index: rowNum,
          raw,
          message: `lease_end muss ISO YYYY-MM-DD sein, war: '${lease_end_raw}'`,
        });
        continue;
      }
      lease_end = lease_end_raw;
    }
    const cold_rent_cents = eurToCents(cold_rent_eur_raw);
    if (cold_rent_cents == null) {
      errors.push({
        row_index: rowNum,
        raw,
        message: `cold_rent_eur ungültig: '${cold_rent_eur_raw}'`,
      });
      continue;
    }
    const additional_costs_cents = eurToCents(get(idx.additional_costs_eur));
    const deposit_cents = eurToCents(get(idx.deposit_eur));
    const rent_type = RENT_TYPES.has(rent_type_raw)
      ? (rent_type_raw as "fixed" | "index" | "stepped")
      : defaultRentType;

    ok.push({
      unit_label,
      last_name,
      first_name,
      email: get(idx.email) || null,
      phone: get(idx.phone) || null,
      lease_start,
      lease_end,
      cold_rent_cents,
      additional_costs_cents,
      deposit_cents,
      rent_type,
    });
  }

  return { ok, errors };
}
