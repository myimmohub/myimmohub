/**
 * Diff-Reporter für Anlage-V Goldstandard-Tests.
 *
 * Vergleicht ein berechnetes Ergebnis (aus runCalculatePipeline + buildElsterLineSummary)
 * gegen einen Goldstandard und produziert einen lesbaren Report mit Ist/Soll/Delta pro Zeile.
 *
 * Verwendet vom CLI: `npm run test:diff`
 * Verwendet auch in Tests via `expectGoldstandardMatch()`.
 */

export type GoldstandardLine = {
  /** Bezeichnung im Goldstandard, z. B. "z35_afa_gebaeude" */
  key: string;
  /** Anlage-V-Zeile, z. B. "Z.35" */
  zeile?: string;
  /** Klartext-Label, z. B. "AfA Gebäude" */
  label: string;
  /** Sollwert in EUR (gerundet) */
  soll: number;
  /** Toleranz in EUR (default: aus _meta.tolerances) */
  tolerance?: number;
};

export type DiffRow = {
  key: string;
  zeile?: string;
  label: string;
  ist: number | null;
  soll: number;
  delta: number | null;
  toleranz: number;
  status: "OK" | "ABWEICHUNG" | "FEHLEND";
};

export function compareLine(line: GoldstandardLine, ist: number | null | undefined, defaultTolerance: number): DiffRow {
  const istNum = ist == null || !Number.isFinite(Number(ist)) ? null : Number(ist);
  const tol = line.tolerance ?? defaultTolerance;
  if (istNum == null) {
    return { key: line.key, zeile: line.zeile, label: line.label, ist: null, soll: line.soll, delta: null, toleranz: tol, status: "FEHLEND" };
  }
  const delta = Math.round((istNum - line.soll) * 100) / 100;
  const status: DiffRow["status"] = Math.abs(delta) <= tol ? "OK" : "ABWEICHUNG";
  return { key: line.key, zeile: line.zeile, label: line.label, ist: istNum, soll: line.soll, delta, toleranz: tol, status };
}

export function buildDiffReport(rows: DiffRow[], header: string): string {
  const colKey = Math.max(8, ...rows.map(r => r.key.length));
  const colLabel = Math.max(20, ...rows.map(r => r.label.length));
  const fmt = (n: number | null) => n == null ? "—" : n.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const lines: string[] = [];
  lines.push("");
  lines.push("═".repeat(110));
  lines.push(` ${header}`);
  lines.push("═".repeat(110));
  lines.push(
    " " +
      "Z".padEnd(6) +
      "Key".padEnd(colKey + 2) +
      "Label".padEnd(colLabel + 2) +
      "Ist".padStart(12) +
      "Soll".padStart(12) +
      "Δ".padStart(10) +
      "  Tol".padStart(7) +
      "  Status",
  );
  lines.push("─".repeat(110));
  for (const r of rows) {
    const statusMark = r.status === "OK" ? "✓ OK       " : r.status === "ABWEICHUNG" ? "✗ ABWEICHUNG" : "? FEHLT     ";
    lines.push(
      " " +
        (r.zeile ?? "").padEnd(6) +
        r.key.padEnd(colKey + 2) +
        r.label.padEnd(colLabel + 2) +
        fmt(r.ist).padStart(12) +
        fmt(r.soll).padStart(12) +
        fmt(r.delta).padStart(10) +
        ("±" + r.toleranz).padStart(7) +
        "  " +
        statusMark,
    );
  }
  const ok = rows.filter((r) => r.status === "OK").length;
  const abw = rows.filter((r) => r.status === "ABWEICHUNG").length;
  const fehl = rows.filter((r) => r.status === "FEHLEND").length;
  lines.push("─".repeat(110));
  lines.push(` ${ok} OK · ${abw} Abweichung · ${fehl} fehlend  (von ${rows.length})`);
  lines.push("═".repeat(110));
  lines.push("");
  return lines.join("\n");
}

export function failOnDiff(rows: DiffRow[]): { hasFailures: boolean; summary: string } {
  const fails = rows.filter((r) => r.status !== "OK");
  if (fails.length === 0) return { hasFailures: false, summary: "Alle Zeilen innerhalb der Toleranz." };
  const summary = fails
    .map((r) => `  · ${r.zeile ?? ""} ${r.key} (${r.label}): Ist=${r.ist} Soll=${r.soll} Δ=${r.delta} (Tol=±${r.toleranz})`)
    .join("\n");
  return { hasFailures: true, summary };
}
