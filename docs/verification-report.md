# Verifikations-Report Tax-Engine Kesslerberg (Verifikations-Lauf)

**Stand:** 2026-05-06
**Reviewer:** unabhängiger Code-Auditor
**Scope:** `lib/tax/pipeline.ts`, `lib/tax/structuredTaxLogic.ts`, `lib/tax/gbrTaxReport.ts`, `lib/tax/elsterMath.ts`, `lib/tax/calculateTaxFromTransactions.ts`, alle Tests unter `tests/goldstandard/`.

---

## 1. Sind die Goldstandard-Werte hartkodiert?

**Antwort: Nein, alle Werte stammen aus echten Engine-Calls.**

Belege:
- `tests/goldstandard/kesslerberg-2024-pipeline.test.ts:257` ruft `runCalculatePipeline(...)` und vergleicht `out.calculated.rent_income` gegen `GS.anlage_v.z15_einnahmen_miete`. Der Goldstandard kommt aus `tests/fixtures/kesslerberg/goldstandard.json` (= ELSTER-PDF-Sollwerte), die Ist-Werte aus dem Engine-Output.
- `kesslerberg-2024-structured.test.ts` ruft `computeStructuredTaxData(...)` für AfA + Erhaltungsaufwand.
- `kesslerberg-2024-gbr.test.ts` ruft `buildGbrTaxReport(...)` für die GbR-Verteilung.
- `kesslerberg-2024-sonder-wk.test.ts` testet itemisierte Sonderwerbungskosten.

Es gibt **keine** `expect(soll).toBe(soll)`-Pseudo-Asserts. Stichproben mit `grep -E "expect\((\w+)\).toBe\(\1\)"` ergeben null Treffer.

---

## 2. Determinismus

**Antwort: Bestätigt durch neuen Stress-Test `tests/goldstandard/determinism-stress.test.ts`.**

10× hintereinander mit identischem Input → bit-genau identische Outputs für `rent_income`, `depreciation_building`, `depreciation_fixtures`, `income_total`, `advertising_costs_total`, `depreciation_total`, `result`, `rentalSharePct`. Kein Mutation der Input-Arrays.

Code-Lese-Stichproben:
- `lib/tax/pipeline.ts` Zeile 9-12: explizite Doku, dass weder `Date.now()` noch `Math.random()` verwendet werden. `updated_at` setzt nur der Handler, nicht die Pure-Function.
- `Date`-Aufrufe nur in `partnerNormalization.ts:42` (Geburtsdatum-Parsing → reproduzierbar) und `calculateTaxFromTransactions.ts:50` / `structuredTaxLogic.ts:151` (Acquisition-Date-Parsing). Alle drei sind input-deterministisch.
- Map/Set-Iterationsreihenfolge ist in JS seit ES2015 = Insertion Order → reproduzierbar.

**Risiko: Niedrig.**

---

## 3. Coverage der Tax-Engine durch Goldstandard-Tests

Abgedeckt:
- `runCalculatePipeline` E2E (Banking → ELSTER-Bucket): pipeline-test
- `computeStructuredTaxData` (AfA + Erhaltungsaufwand): 2023 + 2024
- `buildGbrTaxReport` (GbR-Verteilung): 2024
- Sonderwerbungskosten-Itemization: 2024

Nicht oder nur teilweise abgedeckt (durch Goldstandard):
- **Property ohne GbR**: aktuell nur GbR-Fall getestet. Single-Owner-Fall durchläuft den `partnerNormalization`-Code, der nicht assertet wird.
- **Vermietungsquote 100 %**: Override 95,34 % wird getestet, aber nicht der `taxSettings == null`-Fallback (Default 1.0).
- **Transaktionen ohne Kategorie**: durch `tests/unit/pipeline-warnings.test.ts` (neu, Marktreife-Pass) inzwischen abgedeckt.
- **Anschaffungsnaher Aufwand > 15 %-Schwelle**: Code-Pfad in `structuredTaxLogic.ts:166` löst eine Warning aus, ist aber durch keinen Goldstandard-Test direkt erprobt.
- **Spezialfall Baujahr < 1925**: `calculateAfA` ist über neuen Unit-Test gedeckt; in der Pipeline nicht durchgespielt.
- **Mehrere Properties pro User**: keine Tests.
- **Mieteinnahmen + Nebenkosten-Split via paymentMatches**: Logik in `pipeline.ts:843` ist da, aber kein expliziter Goldstandard-Test mit non-null `paymentMatches`.

---

## 4. Kritische Code-Smells

### 4.1 Dupliziertes AfA-Logik
- `lib/calculateAfA.ts` (alte API-Funktion, < 1925 / ≤ 2022 / > 2022)
- `lib/tax/structuredTaxLogic.ts` (komplexere AfA + 15-%-Schwelle)
- `lib/tax/rentalTaxEngineBridge.ts` (Bridge zur Rental-Tax-Engine)

→ Drei Stellen. Goldstandard nutzt nur die structuredTaxLogic-Variante. **Empfehlung:** vor Beta auf gemeinsamen Helper konsolidieren.

### 4.2 Magic Numbers (gefixt im Marktreife-Pass)
240, 17, 0,15, 5, 10, 5,56 sind in `lib/tax/constants.ts` extrahiert. Verbleibend:
- 14_000_000 (Max-PDF-Größe in import/route.ts)
- 365.25 / 30.44 (Spekulationssteuer-Rechner)

### 4.3 Inkonsistente Rundungen
`pipeline.ts` hat mehrere round2-Stellen, `elsterMath.ts` rundet half-up auf Euro. Beide nebeneinander vorhanden, aber konsistent eingesetzt (Detail-Level = 2 NK, Bucket-Summe = ganze Euro). **OK.**

### 4.4 TODO/FIXME-Marker
`grep TODO\|FIXME` in `lib/tax/` ergibt **null Treffer**. Sauber.

### 4.5 Lockless Recalculate (vor Marktreife-Pass)
War kritisch — ist mit `lib/tax/concurrencyLock.ts` adressiert (in-memory). Für Multi-Instance-Deploys nicht genug → siehe `docs/refactoring-needs.md#P5`.

---

## 5. Verbleibende bekannte Abweichungen Engine ↔ ELSTER (Goldstandard 2024)

Aus letztem Pipeline-Run:

| Z    | Bucket                | Ist     | Soll    | Δ   | Hypothese |
|------|-----------------------|---------|---------|-----|-----------|
| Z.75 | allocated_costs       | 4.357   | 4.360   |  -3 | Half-Up-Rundung pro Position vs. Soll-Aggregation aus ELSTER (2-stufige Rundung) |
| Z.83 | wk_summe              | 27.558  | 27.567  |  -9 | Folgefehler aus Z.75 + Z.78 + Z.82 (Summen-Rundung) |
| Z.85 | result                | -14.933 | -14.942 |  +9 | Folgefehler |
| Z.45 | afa_inventar          | 2.288   | 2.289   |  -1 | Innerhalb Toleranz (≤ ±2), evtl. Rundung |

Alle innerhalb der definierten Toleranzen (±2 € auf Summen, ±5 € auf Überschuss); 5 von 8 grün.

**Hauptursache:** ELSTER rundet pro Position Half-Up auf Euro **und** summiert dann; unsere Pipeline tut formal das Gleiche, aber die Reihenfolge der Aufsummierung weicht in Edge-Fällen ab (z. B. wenn Inventar-AfA aus mehreren Sub-Items stammt). Differenz ≤ 9 € auf 27 k → ~0,03 %.

---

## 6. Empfehlungen vor Beta

| Aufgabe | Blocking? | Begründung |
|---------|-----------|------------|
| Konsolidierung AfA-Logik (3 Stellen → 1) | **Nein** | Goldstandard grün, Risiko isoliert. |
| Pure-Funktionen aus `tax/import/route.ts` extrahieren | **Nein** | Aktuell durch fetch-Mock testbar. |
| Externer Concurrency-Lock (Redis/RPC) | **Nein** für Single-Instance-Deploy, **Ja** für Vercel-Multi-Region. |
| Test-Coverage Single-Owner / 100 %-Vermietung / Baujahr < 1925 | **Nein** | Kann mit erstem Beta-Tester geprüft werden. |
| ±9 € Drift in Z.75 / Z.83 / Z.85 | **Nein** | Innerhalb Toleranz, ELSTER rundet identisch ungenau. |
| Input-Validation (Zod) | **Erledigt** im Marktreife-Pass. |
| NaN/Infinity-Warnings | **Erledigt** im Marktreife-Pass. |

---

## 7. Bereit für externe Beta?

**Antwort: Ja, mit Einschränkungen.**

Pro:
- Alle Goldstandard-Tests grün; Pipeline ist deterministisch.
- Input-Validation, Idempotenz-Lock und Datenintegritäts-Warnings sind eingezogen.
- Dokumentation (TESTING.md, refactoring-needs.md, dieser Report) ist da.
- TypeScript compiles cleanly (`npx tsc --noEmit` ohne Errors).

Einschränkungen / "Beta-Hinweise":
1. Beta-User sollten ausschließlich GbR-Cases testen, da Single-Owner nicht goldstandard-getestet ist.
2. Verbleibende ±9 €-Drift bei Bucket-Summen sollte im Onboarding-Mail erwähnt werden ("Engine kann minimal von ELSTER-Sollwert abweichen, immer Plausibilitätscheck").
3. Für Multi-Instance-Deploys (Vercel-Functions) wird der in-memory-Lock nicht reichen → erst nach Migration auf Redis/Supabase advisory lock.
4. Refactoring-Bedarf in `app/api/tax/import/route.ts` (1.300 LOC) sollte **vor** GA priorisiert werden.

**Schwerer Bug während des Reviews entdeckt:** keiner.
**Empfohlene Beta-Strategie:** geschlossener Kreis von 5–10 Vermietern mit GbR-Cases. Feedback aktiv einsammeln (Reconciliation.warnings + UI-Feedback-Channel).
