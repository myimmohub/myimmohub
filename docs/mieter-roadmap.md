# Mieter- & Einheiten-Modul — Bestandsaufnahme & Roadmap

Stand: 2026-05-06. Diese Bestandsaufnahme beschreibt **ausschließlich**, was im
Hauptbranch `myimmohub/` real existiert. Spec-Referenz (vorhanden):
`testdateien/ImmoHub_Mieter_Einheiten_Spec.docx` (Phase 1 = Dauervermietungs-
Logik).

## 1. Was funktioniert heute?

### 1.1 Datenmodell

- `units` — Migration `supabase/migrations/20260413_units_tenants.sql:9..37`.
  - Felder: `label`, `unit_type ∈ {residential, commercial, parking, other}`,
    `floor`, `area_sqm`, `rooms`, `features` (jsonb), `meter_ids` (jsonb),
    `vat_liable`, `is_active`, `created_at`.
  - RLS: `units_owner` über `properties.user_id = auth.uid()`.
- `tenants` — `20260413_units_tenants.sql:42..80`.
  - Felder u. a.: `unit_id`, `first/last_name`, `email`, `phone`,
    `additional_tenants` (jsonb), `lease_start/end`, `cold_rent_cents`,
    `additional_costs_cents`, `deposit_cents`, `payment_reference`,
    `rent_type ∈ {fixed, index, stepped}`, `status ∈ {active,
    notice_given, ended}`, `source_document_id`, `extraction_confidence`.
  - Indexmiete-/Staffelmiete-Felder ergänzt durch
    `20260415_rent_adjustments.sql:38..43`: `index_base_value`,
    `index_base_date`, `index_interval_months`, `staffel_entries` (jsonb).
- `cost_allocations` — `20260413_units_tenants.sql:85..114`. Heute ohne
  Lese-/Schreibcode (siehe `nebenkosten-roadmap.md`).
- `payment_matches` — `20260413_units_tenants.sql:119..158`, ergänzt um
  `property_id` durch `20260413_payment_matches_property_id.sql:1`.
- `rent_adjustments` — `20260415_rent_adjustments.sql:6..17` mit Historie
  (`effective_date`, `cold_rent_cents`, `additional_costs_cents`,
  `adjustment_type ∈ {manual, index, stepped}`, `index_value`).
- `documents.unit_id` — `20260413_documents_unit_id.sql:2`, optionaler FK
  von Dokumenten auf eine Einheit.

### 1.2 API

- `app/api/units/route.ts:17` — GET (Liste mit aktivem Mieter pro Einheit),
  POST (Anlage). Owner-Check via `properties.user_id = auth.uid()`.
- `app/api/units/[id]/route.ts:1` — GET (Einheit + alle Mieter sortiert),
  PATCH (Stammdatenänderung), DELETE (per `verifyUnitOwnership`).
- `app/api/tenants/route.ts:34` — GET (per `property_id` oder `unit_id`,
  optional `status`-Filter), POST (Anlage; Auto-Generierung
  `payment_reference` als `Miete/<unit-slug>/<YYYY-MM>` wenn nicht gesetzt,
  Slug-Logik in `slugifyLabel` auf `:21..32`).
- `app/api/tenants/[id]/route.ts:48` — GET, PATCH (Auto-Setzen `lease_end`
  wenn `status` auf `ended` wechselt), DELETE: **bewusst 405**, Soft-Delete
  über `status=ended`.
- `app/api/tenants/extract/route.ts:1` — KI-Extraktion aus Mietvertrags-PDF
  via Anthropic-SDK; liefert Felder mit Konfidenz für die UI.
- `app/api/payment-matches/route.ts:21` — GET, POST (`run_matching`,
  `assign`, `update_status`, `delete`). Matching-Kaskade:
  1. `payment_reference` in `description` oder `counterpart` → 0.97
     (`auto_matched`).
  2. Betrag innerhalb 5 % von `cold + zusatz` → 0.92 (`auto_matched`).
  3. `last_name` in `counterpart` → 0.87 (`suggested`).
- `app/api/rent-adjustments/route.ts:23` — GET (Historie pro Mieter),
  POST (legt Adjustment an, **propagiert sofort in `tenants.cold_rent_cents`/
  `additional_costs_cents`**, falls `effective_date <= heute`).
- `app/api/rent-arrears/route.ts:26` — GET (aggregierter Rückstand pro
  Mehrfamilienhaus für einen Monat). Findet zahlende Mieter über
  `payment_matches` mit Status `confirmed`/`auto_matched`.

### 1.3 UI

- `app/dashboard/properties/[id]/units/page.tsx:1` — Einheiten-CRUD-UI inkl.
  CSV-Import-Pfad (`CSV_HEADERS`/`TYPE_MAP`).
- `app/dashboard/properties/[id]/units/[unitId]/page.tsx` — Detailansicht.
- `app/dashboard/properties/[id]/tenants/page.tsx` — Mieterliste pro Property.
- `app/dashboard/properties/[id]/payments/page.tsx:1` — Zahlungs-Matching-UI.
- `app/dashboard/properties/[id]/nka/...` — siehe `nebenkosten-roadmap.md`.
- `lib/banking/categorizeTransaction.ts` und `lib/banking/categoryLookup.ts`
  liefern die Banking-Kategorisierung, die u. a. von `payment-matches`
  benutzt wird.

### 1.4 Was es **NICHT** gibt

- **Keine** automatische Indexmiete-Anpassung: `index_base_value` und
  `index_interval_months` sind in der DB, aber kein Job setzt sie um. Es
  gibt nur den manuellen `POST /api/rent-adjustments`.
- **Keine** automatische Staffelmieten-Anwendung am Stichtag (`staffel_entries`
  liegt nur als JSON-Array in `tenants` herum).
- **Keine** Kündigungsfristen-Logik / Mahnwesen.
- **Keine** SEPA-Mandatsverwaltung.
- **Keine** Rückstandsbenachrichtigung ausserhalb der Dashboard-Anzeige.
- **Kein** Mieter-Portal.
- **Kein** Audit-/History-View für Mieterstammdaten (nur die
  `rent_adjustments`-Historie).

## 2. Was fehlt für Marktreife?

### P0

1. **Pure Function `effectiveRentAt(tenant, rent_adjustments, asOfDate)`.**
   Heute gibt es keine zentrale Stelle, die für ein gegebenes Datum die
   gültige Kalt-/Nebenkosten-Vorauszahlung ermittelt. `rent-adjustments`-API
   schreibt einfach den letzten Wert in `tenants` zurück, sobald das
   Inkrafttreten überschritten ist — historische Auswertungen verlieren
   Kontext.
2. **Indexmiete-Berechnung als Pure Function.** Eingabe:
   `{base_value, base_date, current_index, current_date, interval_months}`,
   Ausgabe: zulässige neue Kaltmiete, eingehaltene Mindestlaufzeit, Datum
   der nächsten möglichen Anpassung.
3. **Staffelmieten-Aktivator.** `staffel_entries` muss in echten
   `rent_adjustments`-Einträgen materialisiert werden (idempotent), sobald
   die `effective_date` erreicht ist.
4. **Pro-Rata-Tage bei Mieterwechsel.** Wenn Vor- und Nachmieter im selben
   Monat in derselben Einheit aktiv sind, brauchen Auswertungen (NKA,
   `rent-arrears`, Anlage V) eine Tage-genaue Zuordnung. Heute nimmt die
   Tax-Pipeline ein einziges aktives Mietverhältnis an.
5. **Validierung „1 aktiver Mieter pro Einheit".** DB-seitig nicht
   erzwungen; im Code wird nur `activeTenants[0]` genommen — das maskiert
   Datenfehler stillschweigend.

### P1

6. **Konsistente Owner-Validierung in `tenants`-API.** Die GET-Route mit
   `unit_id` filtert Owner in JS nach (`route.ts:71..78`); bei großen
   Datenmengen führt das zu N+1-Problemen und versteckten Defekten, falls
   PostgREST den Join wegoptimiert.
7. **Resolver-Bug `payment_matches`**: Tasklist-Eintrag #22
   („matched 'mull' in 'Müller'"). `lib/banking/...` matcht Substrings
   case-insensitiv; deutscher Sonderzeichen-Fall ist nicht abgedeckt. Hier
   sollte die Suche auf Wortgrenzen + Umlaut-Normalisierung umgestellt
   werden, damit der Matcher in `route.ts:244` (`counterpart.includes`)
   nicht „Müller" mit „mull" verwechselt.
8. **Kündigungs-/Notice-Workflow.** Heute gibt es nur das Statusfeld
   `notice_given`, keine Frist und kein Reminder. Mindestens: Datum für
   Kündigungseingang + automatische Kündigungsfrist-Berechnung.
9. **History-View (Audit) für Mieter-Stammdaten.** Aktuell überschreibt
   PATCH `tenants` ohne Audit-Spalte.
10. **Bulk-Import via CSV** existiert nur für Units. Tenants brauchen einen
    analogen Import-Pfad mit KI-Validation.

### P2

11. SEPA-Mandate, Lastschrifteinzug.
12. Mieter-Portal (Self-Service).
13. Dunkelverarbeitung: automatisches Mahnwesen bei Rückständen
    (Mahnstufen, Briefe).
14. Mehrsprachigkeit (Spec setzt aktuell Deutsch voraus).

## 3. Offene fachliche Fragen

- **Welche Indexsserie?** Spec verlangt CPI; speichern wir den konkreten
  Index (`index_value`) oder nur den Anpassungsfaktor? Aktuell nur Wert,
  ohne Quellen-Kennzeichnung.
- **Mindestabstand Indexmiete** — mind. 12 Monate seit letzter Anpassung
  (BGB § 557b)? Wo wird das hart geprüft?
- **Wie behandelt die NKA Mieterwechsel mitten im Abrechnungsjahr?**
  Pro-rata nach Tagen oder nach Wohnmonaten? (siehe Roadmap NKA)
- **Soll-Zahlung pro Monat = Kaltmiete + NK-Vorauszahlung?** Oder muss
  Garage / Stellplatz separat erfasst werden, wenn der Mieter beides hat?
  Heute hat ein Mieter genau eine `unit_id`.
- **WG-Modell**: Spec sagt „immer genau 1 Hauptmieter, Mitbewohner als
  jsonb". Reicht das für Solidarhaftung-Workflows?
- **Soft-Delete Mieter**: Gibt es einen Anonymisierungs-Pfad nach
  DSGVO-Auskunftsfrist?

## 4. Sinnvolle Tests pro Funktionalität

- **Pure Function `effectiveRentAt`** — Goldstandard:
  - Kein Adjustment → fällt zurück auf `tenants.cold_rent_cents`.
  - Mehrere Adjustments mit verschiedenen `effective_date` → das jüngste
    `<=` Stichtag gewinnt.
  - Adjustment mit `effective_date` in der Zukunft → ignoriert.
- **Indexmiete-Berechnung** — gegebene Indexreihe + Mindestlaufzeit:
  - Anpassung vor 12 Monaten unzulässig → erwartete Fehlermeldung.
  - Korrekte Differenzbildung in Cent gerundet.
- **Staffelmieten-Aktivator** — Idempotenz: zweiter Lauf erzeugt keine
  doppelten `rent_adjustments`.
- **Payment-Matching-Kaskade** — gegebener Pool von Mietern + Transaktionen:
  - `payment_reference`-Treffer schlägt Betragsabgleich.
  - „Müller"-Counterpart darf nicht auf Mieter „Mull" matchen
    (P1 Bug-Fix).
- **API-Schema-Tests** für `units` / `tenants` / `rent_adjustments` analog
  zur Tax-API.
- **Pro-rata-Tage** — Mieter A 1.1.–14.6., Mieter B 15.6.–31.12.: Summen
  ergeben Jahressumme, kein Doppelzählen.

## 5. Empfehlung: User-Flow zuerst entwickeln

1. **Pure Function `effectiveRentAt`** in `lib/tenants/effectiveRent.ts`
   inkl. Goldstandard-Tests. (Bereits in dieser PR als
   `tests/e2e/mieter-effective-rent.test.ts` angelegt — siehe unten.)
2. Routen `rent-adjustments`/`tenants` umstellen, sodass historische
   Auswertungen `effectiveRentAt` benutzen statt nur die letzten Werte
   in `tenants`.
3. **Indexmiete-Service** (Pure + scheduled job).
4. **Staffelmieten-Materializer** (idempotent in
   `rent_adjustments`).
5. **NKA-Pro-rata-Verteilung** baut darauf auf (siehe NKA-Roadmap).
6. **Bulk-Import Tenants** + **Audit-View** danach.

Der erste sinnvolle Mehrwert für den User entsteht, sobald Auswertungen
(NKA, Anlage V, `rent-arrears`) konsistent denselben effektiven Mietwert
für ein Datum liefern — das ist heute durch die direkte
`tenants.cold_rent_cents`-Mutation in `rent-adjustments` brüchig.
