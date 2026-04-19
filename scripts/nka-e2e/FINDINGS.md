# NKA-Modul – E2E-Test mit Testnutzer: Findings

**Datum:** 2026-04-19
**Projekt:** `aeeefaniknatnmcafqln` (Prod-DB)
**Vorgehen:** Separater Testnutzer via Service-Role angelegt, Dummy-Property (200 m² / 4 Einheiten) + 3 Mieter mit unterschiedlichen Lease-Konstellationen, 6 Transaktionen. HTTP-Calls per fetch gegen lokalen `next dev` auf Port 3000 mit Session-Cookie des Testnutzers. Testdaten am Ende per `auth.users.delete` + CASCADE komplett entfernt.

## Gesamtergebnis

| Szenario | Passed | Failed |
|---|---|---|
| 1 – Lifecycle + manuelle Kostenpositionen | 19 | 3 |
| 2 – Cost-Item löschen + Recalculate | 2 | 0 |
| 3 – Autofill aus Transaktionen | 7 | 0 |
| 4 – Deadline-Status-View | 0 | 2 |
| 5 – RLS (Fremdnutzer) | 4 | 0 |
| 6 – Input-Validierung | 5 | 0 |
| **Gesamt** | **37** | **5** |

5 von 42 Assertions rot. Aber die 5 roten reduzieren sich auf **2 echte Bugs** (die anderen 3 sind Folge desselben Bugs).

---

## Bug 1 (kritisch) – Ein Tag zu wenig bei Perioden, die nur die Spring-DST-Umstellung kreuzen

**Datei:** `lib/nka/period-calculations.ts:27-29`

```ts
function daysInclusive(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1);
}
```

In Kombination mit `asDate(value) → new Date(`${value}T12:00:00`)` (also lokale Zeit) zieht der Übergang auf Sommerzeit (letzter Sonntag im März, +1 h) 1 Stunde ab. `Math.floor` rundet dann auf den falschen Tag.

### Reproduziert mit `TZ=Europe/Berlin`:

| Zeitraum | Erwartet (inklusiv) | Ist | Status |
|---|---|---|---|
| 2025-01-01 → 2025-06-30 | 181 | 180 | ❌ |
| 2025-07-01 → 2025-12-31 | 184 | 184 | ✓ |
| 2025-01-01 → 2025-12-31 | 365 | 365 | ✓ (beide DST-Wechsel heben sich auf) |
| 2025-03-01 → 2025-04-30 | 61 | 60 | ❌ |
| 2025-09-01 → 2025-10-31 | 61 | 61 | ✓ |
| 2025-02-01 → 2025-02-28 | 28 | 28 | ✓ |

### Geschäftliche Auswirkung

- Betroffen sind alle Mieterzeiträume (`bewohnt_von … bewohnt_bis`), die ausschließlich den Spring-DST-Wechsel kreuzen, aber nicht den Fall-DST-Wechsel – also Auszüge zwischen **31.03. und 26.10.** eines Kalenderjahres, oder Einzüge im gleichen Fenster ohne späteres Auszugsdatum.
- Konkret im Test: Mieterin Carla (01.01. → 30.06.2025) bekommt 180/365 statt 181/365 Anteil und entsprechend:
  - Summe Anteile: 315,62 € statt **317,37 €** (–1,75 €)
  - Summe Vorauszahlungen: 473,42 € statt **476,05 €** (–2,63 €)
  - Auch der Vorauszahlungs-Fallback in `monthlyAdvanceForDays` ist vom gleichen Fehler betroffen.
- Bei größeren Beträgen (z.B. 20.000 € umlagefähige Kosten) summiert sich das auf Beträge, die Widersprüche von Mietern rechtfertigen würden.
- Server läuft in der Regel in UTC → der Bug taucht erst auf, wenn Rechnung in einer Zeitzone mit DST-Wechsel stattfindet. Auf Vercel (UTC) wäre das Verhalten anders als im lokalen Dev-Env → **Gefahr, dass der Fehler auf Dev-Maschinen anders erscheint als in Prod**.

### Fix-Vorschlag

Differenz rein kalendarisch rechnen, nicht über `Date.getTime()`:

```ts
function daysInclusive(start: Date, end: Date) {
  const s = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const e = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.max(0, Math.floor((e - s) / DAY_MS) + 1);
}
```

Oder `asDate` direkt UTC verwenden (`new Date(`${value}T00:00:00Z`)`) – dann ist die gesamte Kette DST-unabhängig.

---

## Bug 2 (leicht) – `v_nka_status_monitor` View in Prod ist schmaler als die Migration definiert

**Datei:** `supabase/migrations/20260419_nka_foundation.sql:291`

Migration definiert den View mit Spalten:
```
id, property_id, property_name, zeitraum_von, zeitraum_bis, status, deadline_abrechnung, deadline_status
```

Die tatsächliche View in `aeeefaniknatnmcafqln` liefert:
```
id, property_id, user_id, zeitraum_von, zeitraum_bis, status, deadline_abrechnung,
gesamtkosten_umlagefaehig, gesamtkosten_nicht_umlagefaehig, tenant_share_count, cost_item_count
```

Also: **`property_name` und `deadline_status` fehlen** (und stattdessen gibt es mehr Kennzahlen-Spalten). Offensichtlich wurde der View über einen anderen Pfad (manuell im Dashboard oder via späterer Migration, die nicht versioniert ist) verändert.

### Auswirkung
- Jede App-Stelle, die `view.deadline_status` oder `view.property_name` lesen will, bekommt `undefined`.
- Grep zeigt aktuell **keine** produktive Nutzung des Views (nur Migration). Damit ist das aktuell "nur" schmutziges Schema, aber ein Landmine für zukünftigen Code.

### Fix-Vorschlag
Entscheide, welche Variante gewollt ist, und lege eine neue Migration an, die den View auf genau diese Form bringt. Andernfalls driftet Prod weiter von den Migrationen weg.

---

## Was sauber funktioniert (mit Dummy-Daten validiert)

### Rechenkorrektheit ohne DST
- **Volle-Periode-Mieterin Anna** (365 Tage, 80 m², 2 Personen):
  - Umlagefähig-Summe: 2.200 € (3 Positionen).
  - Summe Anteile: **780 €** – händisch gerechnet:
    - Versicherung 1.200 € × (80/200) × (365/365) = 480 €
    - Müll 400 € × (1/4) × (365/365) = 100 €
    - Wasser 600 € × (2/6) × (365/365) = 200 €
    - **= 780 €** ✓
  - Vorauszahlung: 150 €/M × 365/30.4167 ≈ **1.800 €** ✓
  - Nachzahlung_oder_guthaben (Generated Column): −1.020 € ✓ (Guthaben für Anna).
- **Unterjähriger Einzug Bernd** (184 Tage ab 01.07., 60 m², 1 Person):
  - 282,30 € Summe ✓ (Zeitanteil 184/365, Wohnfläche 60/200, Person 1/6, Einheit 1/4 — alle drei Schlüssel korrekt kombiniert).
  - Vorauszahlung: 604,93 € ✓
- **Umlagenschlüssel-Mix (3 Schlüssel gleichzeitig)**: Wohnfläche, Personen und Einheiten werden korrekt nebeneinander auf dieselbe Mieter-Zeile angewendet.
- **Property-Wohnfläche-Override** (`totalArea = max(property.wohnflaeche_gesamt_m2, Σ tenant.anteil)`): getestet mit 200 m² vs. 180 m² Summe → 200 m² wird korrekt gezogen, d.h. Leerstand WE4 bleibt in der Wohnflächen-Summe und wird nicht auf andere umgelegt.

### API-Lifecycle
- POST /api/nka/periods: Anlegen ✓, Overlap-Check → 409 ✓, Deadline (generated column +12 Monate) ✓.
- POST cost-items: Syncronisiert Summen und Tenant-Shares transaktional ✓.
- DELETE cost-items: Recalculate läuft automatisch ✓.
- POST /api/nka/periods/:id/autofill:
  - Import von 3 passenden Transaktionen ✓ (Beleuchtung, Heizung, Hauswart).
  - Korrekte Klassifikation per BetrKV-Position ✓.
  - Nicht-BetrKV-Transaktionen (Grundsteuer) werden verworfen ✓.
  - Einnahmen (positiver Betrag, Kategorie ≠ "ausgabe") werden verworfen ✓.
  - Transaktionen außerhalb des Periodenfensters werden ignoriert ✓.
  - **Idempotent:** zweiter Autofill-Call dedupliziert korrekt (keine Duplikate) ✓.
  - Status der Periode springt auf `in_bearbeitung` ✓.

### Sicherheit (RLS)
- Fremdnutzer kann über die HTTP-API keine fremden Perioden lesen (`GET /[id]` → 404) ✓.
- Fremdnutzer kann keine cost-items in fremde Perioden schreiben (POST → 404) ✓.
- Fremdnutzer kann Autofill nicht für fremde Perioden auslösen (404) ✓.
- Listen-Query enthält keine fremden Perioden (`GET /periods` → [] für Fremdnutzer) ✓.

### Input-Validierung
- POST /periods ohne Zeitraum → 400 ✓.
- POST /periods mit fremder property_id → 404 ✓.
- cost-items: fehlende Bezeichnung → 400 ✓, negativer Betrag → 400 ✓, BetrKV außerhalb 1..17 → 400 ✓.

---

## Nicht getestet (aus Scope herausgelassen)

- **WEG-Import / Messdienst-Import** (`nka_weg_imports`, `nka_heating_imports`) – keine API-Routes im Repo, nur Tabellen.
- **Widerspruchs-Workflow** (`nka_disputes`) – keine API-Routes.
- **PDF-Generator** (`app/dashboard/nka/[id]/pdf/page.tsx`) – ist eine Server-rendered Seite, die den PDF-Inhalt als HTML/CSS produziert. Wurde nicht visuell getestet, nur implizit über die zugrundeliegenden Datenqueries.
- **Versand-Flow** (Postmark) – keine öffentliche Route, `versandt_am`/`postmark_message_id` werden vom System nicht gesetzt (nur Spalten vorhanden).
- **Payment-Match-basierte Vorauszahlungen**: Der Pfad `actualAdvancesByTenant` in `recalculate.ts` wurde nicht stimuliert (es gab keine `payment_matches` im Test). Der Fallback-Pfad (monthlyAdvanceForDays) wurde vollständig getestet.
- **Kategorie-Editor**: Test benutzte die vorhandenen Seed-Kategorien. Drift zwischen Migration und Prod-Daten bei Kategorie-Labels wurde beobachtet (z.B. `Wasserversorgung (BetrKV 2)` statt `Wasserversorgung`, Umlageschlüssel-Default `verbrauch` statt `personen`) – das ist kein Bug, nur Migrations-Drift.

---

## Artefakte

- Test-Runner: `scripts/nka-e2e/run.mjs`
- Introspektion: `scripts/nka-e2e/introspect.mjs`, `scripts/nka-e2e/verify-view.mjs`
- Roh-Report der Assertions: `scripts/nka-e2e/REPORT.md`
- Beide Test-User wurden gelöscht (CASCADE hat property, units, tenants, nka_periods, cost_items, tenant_shares automatisch entfernt).

## Empfehlung (Prio)

1. **Bug 1 (DST)** sofort fixen – rechnerisch falsche Abrechnungen sind der kritischste Risikopunkt im gesamten Modul.
2. **Bug 2 (View-Drift)** – klären, welche View-Variante gewollt ist, und per Migration fixieren, bevor UI-Code den View nutzt.
3. Unit-Test für `computeTenantShares` und `daysInclusive` ergänzen (Jest/Vitest ist nicht installiert – entweder `node --test` oder Vitest hinzufügen).
