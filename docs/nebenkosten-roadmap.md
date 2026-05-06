# Nebenkosten-Modul (NKA) — Bestandsaufnahme & Roadmap

Stand: 2026-05-06. Diese Bestandsaufnahme beschreibt **ausschließlich**, was im
Hauptbranch unter `app/`, `components/`, `lib/`, `supabase/migrations/` real
existiert. Eine bereits angefangene NKA-Implementierung im Worktree
`.claude/worktrees/vigorous-visvesvaraya-bb5551/` ist hier explizit **nicht**
mitberücksichtigt — sie ist im Hauptbranch nicht aktiv.

Spec-Referenz (vorhanden, aber noch nicht umgesetzt): `testdateien/ImmoHub_NKA_Spec_v1.0.docx`.

## 1. Was funktioniert heute?

### 1.1 Vorbereitungs-Flow (Status-/Lese-Layer)

- Drei statische Vorbereitungs-Seiten existieren:
  - `app/dashboard/nka/page.tsx:1` — Objektliste, Einstieg in die NKA pro Property.
  - `app/dashboard/properties/[id]/nka/page.tsx:1` — Flow-Übersicht mit drei
    Vorbereitungs-Schritten (Einheiten / Mieter / Zahlungen) und Status pro
    Schritt (`missing` | `partial` | `ready`).
  - `app/dashboard/properties/[id]/nka/[year]/page.tsx:1` — Jahresansicht mit
    Bereitschafts-Status, Soll-Vorauszahlungssumme (12 × Summe
    `additional_costs_cents`) und einer „offene Punkte"-Liste.
- **Alle drei Seiten sind nur Lese-/Status-Layer.** Sie aggregieren bestehende
  `units`, `tenants` und `payment_matches` und melden, ob die Voraussetzungen
  vorhanden sind. Es gibt **keine** Eingabe von Kostenpositionen, **keine**
  Verteilung auf Mieter und **keinen** PDF-Export.

### 1.2 Voraussetzungs-Datenbasis (relevant für NKA)

- Tabellen aus `supabase/migrations/20260413_units_tenants.sql:9..159`:
  - `units` mit `area_sqm`, `meter_ids`, `unit_type`, `vat_liable`.
  - `tenants` mit `cold_rent_cents`, `additional_costs_cents`, `lease_start/end`,
    `status`.
  - `cost_allocations` mit `allocation_method ∈ {direct, sqm, meter_reading,
    manual}`, `share_percent`, `amount_cents`, `meter_value_from/to`.
  - `payment_matches` (`property_id` ergänzt durch
    `supabase/migrations/20260413_payment_matches_property_id.sql:1`).
- API-Routen für die Datenbasis:
  - `app/api/units/route.ts:17` — GET/POST inkl. Owner-Check.
  - `app/api/tenants/route.ts:34` und `app/api/tenants/[id]/route.ts:1` — CRUD.
  - `app/api/payment-matches/route.ts:21` — GET, plus POST mit
    `run_matching` / `assign` / `update_status` / `delete`.
  - `app/api/rent-arrears/route.ts:26` — Mietrückstands-Übersicht (genutzt am
    Dashboard, nicht in NKA).
- Dokumenten-Bridge: `app/api/tenants/extract/route.ts:1` extrahiert
  Mietvertragsdaten via Claude.

### 1.3 Was es **NICHT** gibt (im Hauptbranch)

- Keine `nka_perioden`, `nka_kostenpositionen`, `nka_mieteranteile`,
  `nka_heizkosten_import`, `nka_weg_import` Tabellen. (Spec-Kapitel 4.1.)
- Keine API-Routes unter `/api/nka/...`.
- Keine Lib-Funktionen unter `lib/nka/...`.
- Keine PDF-Generierung der NKA, kein Postmark-Versand, kein Fristenmonitor.
- `cost_allocations` ist DB-seitig vorhanden, wird aber nirgends gelesen oder
  geschrieben (`grep cost_allocation` liefert nur die Migration).

## 2. Was fehlt für Marktreife?

### P0 — blocking für eine erste verkaufbare Version

1. **Datenmodell NKA persistieren.** Migration für `nka_perioden`,
   `nka_kostenpositionen` (mit BetrKV-Position als Enum/FK,
   `verteilungsschluessel`, `umlagefaehig_pct`), `nka_mieteranteile`. Ohne
   diese Tabellen kann nichts gespeichert werden.
2. **Kostenpositionen erfassen.** UI zum Anlegen/Bearbeiten von
   Kostenpositionen pro Periode (manuell). Auto-Befüllung kann später
   nachgeliefert werden.
3. **Verteilungs-Engine als Pure Function.** Bekommt Kostenpositionen +
   Mieter-Anteile + Verteilungsschlüssel (m², Wohnungen, Personen, manueller
   Anteil) und gibt pro Mieter/Position einen Betrag zurück. Genau **eine**
   Quelle der Wahrheit, hervorragend testbar.
4. **Soll-/Ist-Abgleich Vorauszahlungen.** Summe der bestätigten/auto-gematchten
   `payment_matches` für `period_month ∈ Periode` minus Mieteranteil =
   Nachzahlung / Guthaben.
5. **PDF-Export der NKA** je Mieter (Summenseite + Aufschlüsselung). Spec
   verlangt `@react-pdf/renderer` (Spec §10.3). Ein einfacher serverseitiger
   PDF-Renderer reicht, solange das Briefdesign neutral bleibt.
6. **Mietzins-Anpassungen über Periode hinweg** sauber berücksichtigen
   (`rent_adjustments`, Migration `20260415_rent_adjustments.sql:6`). Aktuell
   nutzt nur die Tax-Engine bzw. `rent-arrears` den jeweils aktuellen Stand.

### P1 — wichtig vor breiter Auslieferung

7. **Auto-Befüllung aus Transaktionen.** Banking-Transaktionen, deren Kategorie
   einem BetrKV-Schlüssel zugeordnet ist (Mapping `categories` →
   BetrKV-Position), als Vorschlag in die Periode ziehen.
8. **Leerstandsberücksichtigung.** Bei nicht durchgehend vermieteten Einheiten
   pro-rata berechnen (Spec §6.4.1).
9. **Heizkosten-Modul (Mindeststand).** Mindestens manueller Eintrag der
   Heizkostenabrechnung je Mieter aus PDF (KI-Extraktion ist nice-to-have);
   wegen Heizkostenverordnung keine reine Quadratmeter-Verteilung erlauben.
10. **Anti-Doppelbuchung Anlage V ↔ NKA.** Was als „umlagefähig" auf den Mieter
    geht, soll in der Anlage V nicht ein zweites Mal geltend gemacht werden;
    Spec §12.3.
11. **Periodenstatus & Sperre.** Versendete NKA darf nicht mehr stillschweigend
    geändert werden (Audit-Trail).

### P2 — nice-to-have

12. WEG-Abrechnungs-Import + KI-Extraktion (Spec §9).
13. Techem-/ista-API-Anbindung (Spec §8.2/8.3).
14. Fristenmonitor mit Cron (Spec §7).
15. E-Mail-Versand via Postmark, Zustell-Tracking (Spec §11).
16. Mehrjahres-Vergleich, Widerspruchs-Tracking (Spec §14).
17. Vorauszahlungs-Anpassungsvorschlag nach § 560 BGB (Spec §14.1).

## 3. Offene fachliche Fragen

- **Verteilungsschlüssel je Kostenposition.** Welche Defaults setzen wir
  (m² für Allgemeinstrom/Reinigung, Wohnungen für Müll, Verbrauch für Wasser)?
  Soll der User pro Position überschreiben dürfen, oder lassen wir das nur
  über einen globalen Default je Property zu?
- **Heizkostenverordnung (HeizkostenV).** Mindestens 50 % nach Verbrauch ist
  vorgeschrieben — dürfen wir Heizkosten überhaupt ohne Heizkosten-Importsplit
  abrechnen oder erzwingen wir den Verbrauchsanteil?
- **Vorauszahlungs-Ist/Soll-Abgleich.** Reicht die heutige `payment_matches`-
  Logik (cold + NK in einer Buchung), oder muss eine Aufteilung explizit
  hinterlegt werden? Aktuell wird die Aufteilung nur in
  `lib/tax/pipeline.ts` (Tax-Bereich) durch
  `paymentMatches.cold_rent_cents` / `additional_costs_cents` rekonstruiert.
- **Belegpflicht.** Wo werden Belege für Kostenpositionen verlinkt?
  `cost_allocations.transaction_id` zeigt heute nur auf eine Banking-Transaktion;
  zusätzlich brauchen wir ggf. eine Verbindung zu `documents.id` (Rechnung).
- **Leerstand vs. teilweise Eigennutzung.** Wie kombinieren wir
  `tax_settings.eigennutzung_tage` mit der NKA-Periode? Eigennutzung darf in
  der NKA gegenüber Mietern nicht vorkommen, in der Anlage V aber sehr wohl.
- **Mietverhältniswechsel mitten in der Periode.** Aktueller Code hat
  `tenants.lease_start/end` und `rent_adjustments`, aber keinen
  Pro-rata-Allokator. Wie genau wird zwischen Vor- und Nachmieter aufgeteilt?
- **USt-pflichtige Einheiten** (`units.vat_liable=true`): NKA mit
  separatem USt-Ausweis pro Position?

## 4. Sinnvolle Tests pro Funktionalität

- **Pure Verteilungs-Engine** — Goldstandard-Tests mit erwartbaren Eingaben:
  - 3 Mieter, 2 Kostenpositionen, m²-Schlüssel → exakte Cent-genaue Verteilung,
    Restbetrag wandert nachvollziehbar zur größten Einheit (oder ist
    verbleibender „Vermieteranteil" bei Leerstand).
  - Verbrauchsschlüssel mit Heizkostenanteil 50/50 nach HeizkostenV.
  - Mischnutzung: residential + commercial mit unterschiedlichen Schlüsseln.
- **Soll-/Ist-Abgleich** — gegebene `payment_matches` und Anteilssumme:
  - alle Mieter haben überschüssig gezahlt → Guthaben.
  - ein Mieter hat 0 Zahlungen → kompletter Mieteranteil als Nachzahlung.
- **Leerstand / unterjähriger Mietbeginn** — pro-rata-Tage nach Spec §6.4.1.
- **API-Validation** (Schema + Auth + Ownership) analog zur
  Tax-API (`tests/unit/sonder-wk-api.test.ts`).
- **PDF-Snapshot-Test** — Render-Funktion erhält fixiertes Eingabe-Objekt und
  produziert ein deterministisches Layout-JSON, das gegen einen Goldstandard
  geprüft wird.
- **Anti-Doppelbuchung Anlage V** — Test, dass eine Kostenposition mit Flag
  `auf_mieter_umgelegt=true` in der Anlage-V-Pipeline aus dem Werbungskosten-
  Pool subtrahiert wird.

## 5. Empfehlung: User-Flow zuerst entwickeln

Vorschlag für den Reihenfolge-Pfad:

1. **DB-Migration für `nka_perioden` und `nka_kostenpositionen`** (P0/1).
2. **API-Route `POST /api/nka/periods`** — Periode anlegen (Property + Jahr +
   Datumsspanne + Status `draft`).
3. **API-Route `POST /api/nka/periods/[id]/cost-items`** — manuelle Eingabe
   einer Kostenposition mit BetrKV-Schlüssel.
4. **Pure Function `lib/nka/distribute.ts`** als Goldstandard (mit Tests
   bevor UI gebaut wird). Nimmt `{costItems, units, tenants, periodStart,
   periodEnd}`, liefert `{tenantId → {position → amountCents}}`.
5. **UI-Tab „Kostenpositionen"** im NKA-Editor (eigene Seite oder
   `app/dashboard/properties/[id]/nka/[year]/edit/page.tsx`).
6. **UI-Tab „Mieteranteile"** zeigt das Ergebnis von `distribute()`.
7. **PDF-Export** je Mieter — erst danach E-Mail-Versand.

Erst mit (1)–(7) ist die NKA überhaupt von Hand bedienbar; Auto-Befüllung,
Heizkostenmodul, Fristenmonitor sind Erweiterungen, keine Voraussetzungen.
