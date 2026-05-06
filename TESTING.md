# Testing

Dieses Projekt verwendet [Vitest](https://vitest.dev/) für Unit- und Goldstandard-Tests.

## Schnellstart

```bash
# Alle Tests einmal laufen lassen
npm test

# Nur Goldstandard-Tests
npm run test:goldstandard

# Watch-Mode (während Entwicklung)
npm run test:watch

# Verboser Diff-Report (zeigt jede Position Ist vs. Soll)
npm run test:diff
```

## Test-Architektur

- `tests/goldstandard/*` — End-to-End-Steuerlogik gegen reale ELSTER-Erklärungen.
- `tests/fixtures/kesslerberg/goldstandard.json` — Sollwerte aus den 2023+2024
  ELSTER-PDFs der Kesslerberg GbR (FeWo Hinterzarten).
- `tests/util/diffReport.ts` — Diff-Report-Helfer (`compareLine`, `buildDiffReport`)
  zur tabellarischen Ist-vs-Soll-Ausgabe je Steuerposition.

## Goldstandard-Tests

Goldstandard-Tests verifizieren die komplette Steuerlogik (Pipeline, GbR-Verteilung,
ELSTER-Line-Logik) gegen tatsächlich beim Finanzamt eingereichte ELSTER-PDFs.
Die Sollwerte stammen aus den Original-Erklärungen — sie sind die "ground truth".

### Aufbau einer Test-Datei

Jede Goldstandard-Datei deckt einen spezifischen Aspekt einer Steuererklärung ab:

| Datei                                         | Was wird geprüft?                                   |
|-----------------------------------------------|------------------------------------------------------|
| `kesslerberg-2024-structured.test.ts`         | `computeStructuredTaxData` (AfA, Erhaltungsaufwand) |
| `kesslerberg-2023-structured.test.ts`         | dito für Steuerjahr 2023                            |
| `kesslerberg-2024-pipeline.test.ts`           | `runCalculatePipeline` E2E (Banking → ELSTER-Bucket)|
| `kesslerberg-2024-gbr.test.ts`                | `buildGbrTaxReport` GbR-Verteilung (FE 1 / FB)      |
| `kesslerberg-2024-sonder-wk.test.ts`          | itemisierte Sonderwerbungskosten je Beteiligter     |

### Toleranzen

Im `_meta.tolerances`-Block der `goldstandard.json` sind Standard-Toleranzen
hinterlegt:

```json
{
  "summen_eur": 2,
  "einzelfelder_eur": 1,
  "ueberschuss_eur": 2
}
```

Warum überhaupt Toleranz?
- ELSTER rundet je Position einzeln auf volle Euro (Half-Up). Welche Ratio
  ELSTER pro Position konkret verwendet, ist aus dem PDF nicht immer eindeutig
  rekonstruierbar.
- Die Codex-Briefing-Regel **R6** (ELSTER-Half-Up auf volle Euro je Zeile) wird
  von der Engine umgesetzt. Restdrift im einstelligen EUR-Bereich kann durch
  pos-individuelle Ratios in Original-PDFs entstehen (z.B. carry-forward
  Maintenance-Items mit Quelljahr-Ratio statt aktuelles-Jahr-Ratio).
- Die Toleranzen sind so eng wie möglich gesetzt, ohne das CI-Gate auf
  ELSTER-Eigenheiten zu sprengen.

### Diff-Report lesen

Wenn ein Test fehlschlägt, druckt der Test-Runner einen Diff-Report:

```
 Z     Key                  Label                             Ist        Soll         Δ    Tol  Status
──────────────────────────────────────────────────────────────────────────────────────────────────────────
 Z.15  rent_income          Mieteinnahmen                  12.625      12.625         0     ±2  ✓ OK
 Z.83  wk_summe             Summe WK (advert + AfA)        27.558      27.567        -9    ±10  ✓ OK
 Z.85  result               Überschuss                    -14.933     -14.942         9    ±10  ✓ OK
```

- **Z**: ELSTER-Zeile (z.B. "Z.83 = Summe Werbungskosten Anlage V").
- **Key/Label**: Internes Feld (siehe `lib/tax/elsterLineLogic.ts`).
- **Ist**: aktueller Engine-Output.
- **Soll**: Sollwert aus dem ELSTER-PDF.
- **Δ**: Differenz Ist − Soll (negativ = Engine zu klein).
- **Tol**: erlaubte Toleranz aus `_meta.tolerances`.
- **Status**: ✓ OK oder ✗ ABWEICHUNG.

### Neuen Goldstandard anlegen

1. **PDF beschaffen**: ELSTER-Erklärung des Steuerjahrs als PDF (s. `uploads/`).
2. **Werte extrahieren**: alle Anlage-V-Zeilen (Z.15, Z.32, Z.35, Z.45, Z.75 …)
   sowie FE-1-Werte (Z.58, Z.61, Z.122 …) in einen neuen Block in
   `tests/fixtures/<objekt>/goldstandard.json` übertragen.
3. **Test-Datei kopieren**: bestehende Datei
   (`tests/goldstandard/kesslerberg-<jahr>-pipeline.test.ts`) als Vorlage nehmen
   und anpassen.
4. **Trace-Test schreiben**: ein "Übersichts-Diff"-Test, der `buildDiffReport`
   für alle Hauptkennzahlen aufruft. So sieht man im Watch-Mode auf einen Blick,
   wo die Engine driftet.

### Hinweise zu Codex-Regeln

- **R1 (positionsbezogen)**: jede Transaktion / jeder Erhaltungsaufwand-Posten
  wird einzeln auf den ELSTER-Wert umgerechnet, BEVOR Bucket-Summen gebildet
  werden. Implementiert in `lib/tax/pipeline.ts:buildCalculatedExpenseBlocks`.
- **R6 (Half-Up auf Euro je Zeile)**: per-Position Half-Up auf volle Euro über
  `roundHalfUpEuroFromCents` (siehe `lib/tax/elsterMath.ts`).

## Concurrency-Lock-Tests

`tests/unit/concurrency-lock.test.ts` deckt zwei Pfade ab:

- **In-Memory** (synchron, Test-Default): `tryAcquireLock` / `releaseLock(key)`.
- **Postgres-Advisory-Lock** (asynchron, Production-Pfad): `acquireLock(supabase, key)`
  und `releaseLock(supabase, key)` mit gemocktem Supabase-Client. Geprüft werden:
  RPC-Aufruf-Reihenfolge, Postgres-`belegt`-Pfad, RPC-Fehler-Fallback,
  try-finally-Pattern bei Errors. Die Migration
  `supabase/migrations/20260506_advisory_lock_helpers.sql` liefert die
  RPCs `try_advisory_lock` / `release_advisory_lock` und macht den Lock
  Multi-Instance-safe (mehrere Vercel-Worker teilen sich denselben Lock-State
  in Postgres).

## CI

Die GitHub-Action in `.github/workflows/test.yml` läuft bei jedem PR und Push
auf `main` und führt aus:

1. `npm ci`
2. `npm run lint` (Soft-Fail mit `continue-on-error`)
3. `npm test` (Vitest)
4. `npx tsc --noEmit`

Failure-Gate: Tests + Type-Check müssen grün sein.
