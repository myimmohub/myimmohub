# Refactoring Needs (Marktreife-Pass)

Diese Liste sammelt Code-Stellen, die für besser testbare / wartbare Architektur
extrahiert werden sollten. Enthält **nur** Punkte, die im Marktreife-Pass aufgefallen
sind und nicht direkt fixbar waren.

## P1: Pure-Funktionen aus API-Routes extrahieren

### `app/api/tax/import/route.ts`
Aktuell sind diese Funktionen file-private (~1.300 LOC im Route-Handler):

- `extractJsonText(raw: string)` — JSON-Parser mit Markdown-Fence-Tolerance
- `parseGermanAmount(value)` — "1.234,56" → 1234.56
- `parseOfficialElsterValuesFromText(args)` — OCR-Augmentation: liest offizielle
  ELSTER-Markervalues aus dem PDF-Text (z. B. "Z. 35: 12.106,00").
- `asNullableNumber/Integer/String/Boolean/DateString` — defensive Coerce-Helpers.
- `unwrapExtractedValue` — { value, confidence } unwrap.
- `normalizeImportedMaintenanceDistribution` / `inferMaintenanceSourceYear` —
  Heuristik für Verteilungsjahre / Quelljahr aus Labeltext.
- `reconcileMaintenanceDistributionsWithExpenseBlocks` — Konsistenzprüfung
  zwischen extrahierten Block-Summen und maintenance_distributions.

**Vorschlag:** nach `lib/tax/importParser.ts` extrahieren und in der Route
re-exportieren. Erlaubt echte Unit-Tests (heute: nur indirekter Mock-Roundtrip
gegen `fetch`-Mock möglich, siehe `tests/e2e/tax-pdf-import.test.ts`).

### PDF-Text-Extraktion ohne Anthropic-Roundtrip
`lib/ai/extractText.ts` nutzt direkt die Anthropic Messages API. Für lokale
Tests / Offline-Mode wäre ein Fallback auf einen lokalen PDF-Parser sinnvoll
(z. B. `pdf-parse`), damit `tests/e2e/documents.test.ts` echte PDFs gegen die
Pipeline testen kann ohne Mock.

## P2: Dupliziertes AfA-Logik

Drei Stellen mit AfA-Berechnung, leicht abweichende Sätze/Schwellen:

1. `lib/calculateAfA.ts` — Baujahr-Switch < 1925 / ≤ 2022 / > 2022.
2. `lib/tax/structuredTaxLogic.ts` — komplexere AfA mit Sondersätzen.
3. `lib/tax/rentalTaxEngineBridge.ts` — Brücke zur Rental-Tax-Engine.

Sollten alle einen gemeinsamen Helper benutzen
(`lib/tax/afa.ts` mit `resolveAfaRate(baujahr, kategorie)`).

## P3: Magic Numbers (gefixt im Marktreife-Pass)

Werte 240 / 17 / 0.15 / 5 / 10 / 5.56 wurden in `lib/tax/constants.ts` extrahiert.
Verbleibend: Magic-Number "0,1*pdf-base64-Länge ≤ 14_000_000" (~10 MB) in
`app/api/tax/import/route.ts` Zeile ~735.

## P4: ContractExtraction-Komponente

`components/ContractExtraction.tsx` ist UI-only (`useState`, `useRouter`).
Datenpfad ist via `lib/ai/extractContract.ts` testbar. Für E2E-UI-Tests wäre
Playwright/Vitest-Browser-Mode nötig — derzeit nicht im Setup.

## P5: API-Routes / Idempotenz / Concurrency

`app/api/tax/calculate/route.ts` hat in der Marktreife-Iteration eine
in-memory Lock-Map bekommen (siehe `lib/tax/concurrencyLock.ts`).
Für Multi-Instance-Deploys (Vercel-Functions, Cloudflare Workers) muss
das auf einen externen Store (Redis / Supabase RPC mit advisory lock) umgestellt
werden, sonst sind parallele Calls von verschiedenen Instanzen weiterhin möglich.
