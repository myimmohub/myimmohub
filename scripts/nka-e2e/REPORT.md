# NKA E2E Test Report

Datum: 2026-04-19T07:57:57.026Z
Project: aeeefaniknatnmcafqln


## Seed

- ℹ️ Test-User: nka-e2e-1776585477026@immohub-test.invalid · id=51435112-e02d-43d1-a208-031a16822272
- ℹ️ Stranger-User (für RLS-Check): nka-e2e-stranger-1776585477026@immohub-test.invalid · id=5bcbb116-fa46-426d-8022-e1d906a60825
- ℹ️ Property: 0aeaa8f2-593e-4d18-94dc-880d88d1f2c0 · Gesamt-Wohnfläche 200 m² · 4 Einheiten
- ℹ️ Units: WE1=80m², WE2=60m², WE3=40m², WE4=20m² (Summe 200m²)
- ℹ️ Tenants: Anna (WE1 voll, 2P, 150€ VZ) · Bernd (WE2 ab 1.7., 1P, 100€ VZ) · Carla (WE3 bis 30.6., 3P, 80€ VZ) · WE4 leer

## Szenario 1 – Periode anlegen, manuelle Kostenposition, Recalculate

- ✅ Periode angelegt: id=8326cb29-cefc-4ab9-885a-7858e86d320b, status=offen, deadline=2026-12-31
- ✅ Deadline-Generated-Column: "2026-12-31"
- ✅ Überlappende Periode wird abgelehnt (409): 409.00 ≈ 409.00
- ✅ Cost item 1 angelegt, Summe umlagefähig=1200
- ✅ Summe umlagefähig bleibt bei 1200 €: 1200.00 ≈ 1200.00
- ✅ Summe nicht umlagefähig = 800 €: 800.00 ≈ 800.00

### Erwartete tenant_shares

- ✅ tenant_shares Count: 3
- ℹ️ Expected: Anna=780 · Bernd=282.3 · Carla=317.37
- ✅ Anna tage_anteil = 365: 365.00 ≈ 365.00
- ✅ Anna bewohnt_von: "2025-01-01"
- ✅ Anna bewohnt_bis: "2025-12-31"
- ✅ Anna summe_anteile: 780.00 ≈ 780.00
- ✅ Anna summe_vorauszahlungen: 1800.00 ≈ 1800.00
- ✅ Anna nachzahlung_oder_guthaben (generated): -1020.00 ≈ -1020.00
- ✅ Bernd tage_anteil = 184: 184.00 ≈ 184.00
- ✅ Bernd bewohnt_von: "2025-07-01"
- ✅ Bernd bewohnt_bis: "2025-12-31"
- ✅ Bernd summe_anteile: 282.30 ≈ 282.30
- ✅ Bernd summe_vorauszahlungen: 604.93 ≈ 604.93
- ✅ Carla tage_anteil = 181: 181.00 ≈ 181.00
- ✅ Carla bewohnt_von: "2025-01-01"
- ✅ Carla bewohnt_bis: "2025-06-30"
- ✅ Carla summe_anteile: 317.37 ≈ 317.37
- ✅ Carla summe_vorauszahlungen: 476.05 ≈ 476.05

## Szenario 2 – Cost Item löschen + Recalculate

- ✅ DELETE cost-item status 200: 200.00 ≈ 200.00
- ✅ Nach Löschung: 3 Positionen, Summe umlagefähig=1600

## Szenario 3 – Autofill aus Transaktionen

- ℹ️ 6 Test-Transaktionen angelegt (3 sollten in Autofill landen: Beleuchtung, Heizung, Hauswart)
- ✅ Autofill: imported_positions=3
- ✅ Autofill importierte 3 Positionen (Beleuchtung, Heizung, Hauswart): 3.00 ≈ 3.00
- ✅ Status nach Autofill = 'in_bearbeitung': "in_bearbeitung"
- ℹ️ Nach Autofill: 3 tx-Positionen + 3 manuelle Positionen
- ✅ 3 Positionen aus Transaktionen: 3.00 ≈ 3.00
- ✅ BetrKV-Positionen von Autofill: 11, 14, 4
- ✅ BetrKV 4, 11, 14 korrekt klassifiziert
- ℹ️ Neue Summe umlagefähig: 2500 €
- ✅ Idempotent: 2. Autofill importiert wieder 3: 3.00 ≈ 3.00
- ✅ Nach 2. Autofill weiterhin 3 tx-Positionen (keine Duplikate): 3.00 ≈ 3.00

## Szenario 4 – Deadline-Status in der Liste

- ℹ️ Alte Periode 2020: deadline=2021-12-31
- ❌ **FAIL:** Alte Periode deadline_status=critical: actual=undefined vs expected="critical"
- ❌ **FAIL:** 2025er Periode deadline_status=ok (>90 Tage): actual=undefined vs expected="ok"

## Szenario 5 – RLS: Fremd-User darf nicht zugreifen

- ✅ Stranger listet Perioden (leer erwartet): 0.00 ≈ 0.00
- ✅ Stranger GET Periode → 404: 404.00 ≈ 404.00
- ✅ Stranger POST cost-item → 404: 404.00 ≈ 404.00
- ✅ Stranger Autofill → 404: 404.00 ≈ 404.00

## Szenario 6 – Input-Validierung

- ✅ POST /periods ohne Zeitraum → 400: 400.00 ≈ 400.00
- ✅ POST /periods mit fremder property_id → 404: 404.00 ≈ 404.00
- ✅ cost-item ohne Bezeichnung → 400: 400.00 ≈ 400.00
- ✅ cost-item mit negativem Betrag → 400: 400.00 ≈ 400.00
- ✅ cost-item mit BetrKV=99 → 400: 400.00 ≈ 400.00

## Cleanup

- ✅ 6 Transaktionen gelöscht
- ✅ User 51435112-e02d-43d1-a208-031a16822272 gelöscht (CASCADE)
- ✅ User 5bcbb116-fa46-426d-8022-e1d906a60825 gelöscht (CASCADE)
