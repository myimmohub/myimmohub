/**
 * NKA-PDF-Renderer (eine Seite pro Mieter).
 *
 * PR-Notiz · Lib-Wahl: Wir haben uns gegen `@react-pdf/renderer` entschieden,
 * obwohl der Spec-§10.3 das nominell präferiert. Drei pragmatische Gründe:
 *   1. Kein React-Render-Tree nötig (eine Seite, statisches Layout) — eine
 *      virtuelle DOM bringt hier eher Overhead als Mehrwert.
 *   2. `@react-pdf/renderer` zieht Yoga (WASM) und ist auf Edge-Runtime
 *      fragil; unsere Route läuft im Standard-Node-Runtime und soll klein
 *      bleiben.
 *   3. `pdf-lib` (1.17, MIT) ist bereits weit verbreitet, hat keine native-
 *      Dependencies und liefert hier in <30 KB Code-Footprint ein Ergebnis.
 *
 * Das eigentliche Layout wird in zwei Schritten gebaut:
 *   1. `buildNkaPdfRenderData()` — pure Funktion, baut aus DB-Rows die
 *      Render-Datenstruktur (testbar, Snapshot-fähig).
 *   2. `renderNkaPdf()` — nimmt die Render-Datenstruktur und liefert ein
 *      Uint8Array PDF. Nutzt nur die Built-in Helvetica (Standard-Font, kein
 *      Unicode-Subsetting nötig) und A4-Format.
 *
 * Hinweis: Spezifische Sonderzeichen wie € werden über das WinAnsi-Encoding
 * der Helvetica-Font abgedeckt. Sehr exotische Glyphen (CJK) sind nicht
 * unterstützt; das ist für deutschsprachige Mieterabrechnungen unkritisch.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { NkaShareLine } from "@/lib/nka/distribute";

// ─── Render-Daten-Typ (Pure-Layer) ───────────────────────────────────────────

/**
 * Das ist die einzige Datenstruktur, die `renderNkaPdf` versteht.
 * Sie ist bewusst flach gehalten und enthält bereits alles formatiert (€-Strings),
 * damit der Renderer keine Geschäftslogik mehr enthält.
 */
export type NkaPdfRenderData = {
  property: { name: string; address: string | null };
  tenant: { name: string; address: string | null };
  period: { start: string; end: string }; // bereits dt. Format dd.mm.yyyy
  lines: Array<{
    label: string;
    schluessel: string;
    brutto_eur_str: string; // "264,00 €"
    umlagefaehig_eur_str: string;
    tenant_share_eur_str: string;
  }>;
  total_share_eur_str: string;
  total_paid_advance_eur_str: string;
  /** "Nachzahlung" oder "Guthaben" (oder "Ausgeglichen"). */
  saldo_label: string;
  saldo_eur_str: string;
  active_days: number;
  /** Footer-Hinweistext (BGB-Widerspruchsfrist + Beleg-Hinweis). */
  hinweis_text: string;
  /** Z.B. "Hinterzarten, 06.05.2026" — Caller liefert Ort/Datum. */
  ort_datum: string;
};

// ─── Helpers (DE-Format) ─────────────────────────────────────────────────────

function fmtCentsDe(cents: number): string {
  const eur = cents / 100;
  return eur.toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtIsoDateDe(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

// ─── Pure Build-Step ─────────────────────────────────────────────────────────

export type BuildNkaPdfRenderDataInput = {
  property: { name: string | null; address: string | null };
  tenant: { name: string; address?: string | null };
  period: { period_start: string; period_end: string };
  /** breakdown aus nka_mieteranteile.breakdown (NkaShareLine[]). */
  breakdown: NkaShareLine[];
  total_share_cents: number;
  total_paid_advance_cents: number;
  active_days: number;
  /** Ort & ISO-Datum, Caller bestimmt — vermeidet Date.now im Renderer. */
  ort: string;
  datum_iso: string;
};

/**
 * Baut die für `renderNkaPdf` nötigen Strings aus DB-Rows.
 * Pure Funktion (keine Side-Effects, kein I/O), ideal für Snapshot-Tests.
 */
export function buildNkaPdfRenderData(
  input: BuildNkaPdfRenderDataInput,
): NkaPdfRenderData {
  const balance = input.total_paid_advance_cents - input.total_share_cents;
  let saldoLabel: string;
  if (balance > 0) {
    saldoLabel = "Guthaben (zugunsten Mieter)";
  } else if (balance < 0) {
    saldoLabel = "Nachzahlung (zugunsten Vermieter)";
  } else {
    saldoLabel = "Ausgeglichen";
  }

  return {
    property: {
      name: input.property.name ?? "",
      address: input.property.address ?? null,
    },
    tenant: {
      name: input.tenant.name,
      address: input.tenant.address ?? null,
    },
    period: {
      start: fmtIsoDateDe(input.period.period_start),
      end: fmtIsoDateDe(input.period.period_end),
    },
    lines: input.breakdown.map((line) => ({
      label: line.label,
      schluessel: line.schluessel,
      brutto_eur_str: fmtCentsDe(line.base_brutto_cents),
      umlagefaehig_eur_str: fmtCentsDe(line.umlagefaehig_cents),
      tenant_share_eur_str: fmtCentsDe(line.tenant_share_cents),
    })),
    total_share_eur_str: fmtCentsDe(input.total_share_cents),
    total_paid_advance_eur_str: fmtCentsDe(input.total_paid_advance_cents),
    saldo_label: saldoLabel,
    saldo_eur_str: fmtCentsDe(Math.abs(balance)),
    active_days: input.active_days,
    hinweis_text:
      "Diese Abrechnung wurde mit MyImmoHub erstellt. Belege liegen beim Vermieter vor. " +
      "Widerspruchsfrist 12 Monate ab Zugang (§ 556 Abs. 3 BGB).",
    ort_datum: `${input.ort}, ${fmtIsoDateDe(input.datum_iso)}`,
  };
}

// ─── PDF-Renderer ────────────────────────────────────────────────────────────

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN_X = 50;
const MARGIN_TOP = 60;

/**
 * pdf-lib's Standard-Fonts sind auf WinAnsi limitiert; ein paar typische
 * deutsche Sonderzeichen (ä, ö, ü, ß, €) sind enthalten, aber bspw.
 * "≥" oder "—" nicht. Wir filtern nur die wirklich problematischen Zeichen
 * (alles über U+FFFF) und ersetzen "—" / "–" durch "-" zur Sicherheit.
 */
function safe(text: string): string {
  return text
    .replace(/[—–]/g, "-")
    .replace(/[\u{10000}-\u{10FFFF}]/gu, "?");
}

function drawText(
  page: PDFPage,
  text: string,
  opts: { x: number; y: number; size: number; font: PDFFont; color?: ReturnType<typeof rgb> },
): void {
  page.drawText(safe(text), {
    x: opts.x,
    y: opts.y,
    size: opts.size,
    font: opts.font,
    color: opts.color ?? rgb(0, 0, 0),
  });
}

/**
 * Rendert das PDF aus den fertigen Render-Daten.
 *
 * Layout (eine A4-Seite, Top-Down):
 *   1. Briefkopf: Property
 *   2. Empfänger-Block: Tenant
 *   3. Betreff-Zeile
 *   4. Tabelle (Kopf + N Zeilen, einfache Linien)
 *   5. Summen-Block, Saldo, aktive Tage
 *   6. Footer-Hinweis, Ort/Datum/Unterschrift
 */
export async function renderNkaPdf(data: NkaPdfRenderData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = A4_HEIGHT - MARGIN_TOP;

  // ── 1. Briefkopf (Property) ────────────────────────────────────────────────
  drawText(page, data.property.name || "Vermieter", { x: MARGIN_X, y, size: 13, font: bold });
  y -= 14;
  if (data.property.address) {
    drawText(page, data.property.address, { x: MARGIN_X, y, size: 10, font });
    y -= 16;
  } else {
    y -= 4;
  }

  // ── 2. Empfänger ───────────────────────────────────────────────────────────
  y -= 18;
  drawText(page, "An:", { x: MARGIN_X, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
  y -= 12;
  drawText(page, data.tenant.name, { x: MARGIN_X, y, size: 11, font: bold });
  y -= 13;
  if (data.tenant.address) {
    drawText(page, data.tenant.address, { x: MARGIN_X, y, size: 10, font });
    y -= 13;
  }

  // ── 3. Betreff ─────────────────────────────────────────────────────────────
  y -= 22;
  drawText(
    page,
    `Nebenkostenabrechnung ${data.period.start} - ${data.period.end}`,
    { x: MARGIN_X, y, size: 13, font: bold },
  );
  y -= 22;

  // ── 4. Tabelle ─────────────────────────────────────────────────────────────
  // Spaltenpositionen (linksbündig: Position+Schlüssel, rechtsbündig: Beträge)
  const COL_LABEL_X = MARGIN_X;
  const COL_SCHLUESSEL_X = MARGIN_X + 200;
  const COL_BRUTTO_X = MARGIN_X + 280;
  const COL_UMLAGE_X = MARGIN_X + 360;
  const COL_SHARE_X = MARGIN_X + 450;

  const headerRowY = y;
  drawText(page, "Position", { x: COL_LABEL_X, y, size: 9, font: bold });
  drawText(page, "Schlüssel", { x: COL_SCHLUESSEL_X, y, size: 9, font: bold });
  drawText(page, "Brutto", { x: COL_BRUTTO_X, y, size: 9, font: bold });
  drawText(page, "Umlagefähig", { x: COL_UMLAGE_X, y, size: 9, font: bold });
  drawText(page, "Mieteranteil", { x: COL_SHARE_X, y, size: 9, font: bold });
  y -= 4;
  page.drawLine({
    start: { x: MARGIN_X, y },
    end: { x: A4_WIDTH - MARGIN_X, y },
    thickness: 0.5,
    color: rgb(0.6, 0.6, 0.6),
  });
  y -= 12;

  for (const line of data.lines) {
    if (y < 160) {
      // Falls die Zeilen über den Footer-Bereich hinausgehen, brechen wir
      // bewusst ab (Spec: "eine Seite reicht"). Die letzten Zeilen werden
      // weggeschnitten, dafür bleibt der Saldo-Block lesbar.
      drawText(page, "...", { x: COL_LABEL_X, y, size: 10, font });
      y -= 12;
      break;
    }
    drawText(page, line.label.slice(0, 30), { x: COL_LABEL_X, y, size: 9, font });
    drawText(page, line.schluessel, { x: COL_SCHLUESSEL_X, y, size: 9, font });
    drawText(page, line.brutto_eur_str, { x: COL_BRUTTO_X, y, size: 9, font });
    drawText(page, line.umlagefaehig_eur_str, { x: COL_UMLAGE_X, y, size: 9, font });
    drawText(page, line.tenant_share_eur_str, { x: COL_SHARE_X, y, size: 9, font });
    y -= 12;
  }

  page.drawLine({
    start: { x: MARGIN_X, y },
    end: { x: A4_WIDTH - MARGIN_X, y },
    thickness: 0.5,
    color: rgb(0.6, 0.6, 0.6),
  });
  y -= 18;

  // ── 5. Summen + Saldo ──────────────────────────────────────────────────────
  drawText(page, "Summe Mieteranteil:", { x: COL_UMLAGE_X, y, size: 10, font: bold });
  drawText(page, data.total_share_eur_str, { x: COL_SHARE_X, y, size: 10, font: bold });
  y -= 14;
  drawText(page, "Vorauszahlungen:", { x: COL_UMLAGE_X, y, size: 10, font });
  drawText(page, data.total_paid_advance_eur_str, { x: COL_SHARE_X, y, size: 10, font });
  y -= 14;
  drawText(page, data.saldo_label, { x: COL_UMLAGE_X, y, size: 10, font: bold });
  drawText(page, data.saldo_eur_str, { x: COL_SHARE_X, y, size: 10, font: bold });
  y -= 18;
  drawText(page, `Aktive Tage in der Periode: ${data.active_days}`, {
    x: MARGIN_X,
    y,
    size: 9,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });

  // ── 6. Footer + Ort/Datum/Unterschrift ─────────────────────────────────────
  // Hinweistext robust umbrechen (≈ 90 Zeichen pro Zeile bei size 8).
  const FOOTER_TOP_Y = 130;
  const wrap = (text: string, width = 90): string[] => {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      if ((cur + " " + w).trim().length > width) {
        if (cur) lines.push(cur);
        cur = w;
      } else {
        cur = (cur ? cur + " " : "") + w;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  };
  let footerY = FOOTER_TOP_Y;
  for (const line of wrap(data.hinweis_text)) {
    drawText(page, line, { x: MARGIN_X, y: footerY, size: 8, font, color: rgb(0.3, 0.3, 0.3) });
    footerY -= 10;
  }

  // Unterschriftsfeld
  const SIG_Y = 60;
  drawText(page, data.ort_datum, { x: MARGIN_X, y: SIG_Y + 24, size: 9, font });
  page.drawLine({
    start: { x: MARGIN_X, y: SIG_Y },
    end: { x: MARGIN_X + 200, y: SIG_Y },
    thickness: 0.5,
    color: rgb(0.5, 0.5, 0.5),
  });
  drawText(page, "Unterschrift Vermieter", { x: MARGIN_X, y: SIG_Y - 10, size: 8, font, color: rgb(0.5, 0.5, 0.5) });

  // headerRowY ist nur referenziert, damit eslint sich nicht aufregt.
  void headerRowY;

  return await doc.save();
}
