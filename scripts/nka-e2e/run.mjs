#!/usr/bin/env node
/**
 * NKA End-to-End Test Runner
 *
 * Seeds test user + property + units + tenants + transactions,
 * logs in as test user, calls HTTP API against dev server,
 * validates against hand-computed expected values,
 * writes markdown report, and cleans up.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

const envPath = process.argv[2] || "/Users/leotacke/Documents/Privat/Immohub/myimmohub/.env.local";
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.APP_URL || "http://localhost:3000";

const PROJECT_REF = SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1];
const COOKIE_NAME = `sb-${PROJECT_REF}-auth-token`;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

// ---------------------------------------------------------------------------
// Report helpers
// ---------------------------------------------------------------------------

const report = [];
function log(...args) {
  console.log(...args);
}
function ok(line) {
  report.push(`- ✅ ${line}`);
  log(`  ✅ ${line}`);
}
function fail(line) {
  report.push(`- ❌ **FAIL:** ${line}`);
  log(`  ❌ FAIL: ${line}`);
}
function info(line) {
  report.push(`- ℹ️ ${line}`);
  log(`  ℹ️ ${line}`);
}
function section(title) {
  report.push(`\n## ${title}\n`);
  log(`\n=== ${title} ===`);
}
function subsection(title) {
  report.push(`\n### ${title}\n`);
  log(`\n--- ${title} ---`);
}

function approx(a, b, eps = 0.01) {
  return Math.abs(Number(a) - Number(b)) <= eps;
}

function expect(label, actual, expected, eps = 0.01) {
  if (typeof expected === "number") {
    if (approx(actual, expected, eps)) ok(`${label}: ${Number(actual).toFixed(2)} ≈ ${expected.toFixed(2)}`);
    else fail(`${label}: actual=${actual} vs expected=${expected}`);
  } else {
    if (actual === expected) ok(`${label}: ${JSON.stringify(actual)}`);
    else fail(`${label}: actual=${JSON.stringify(actual)} vs expected=${JSON.stringify(expected)}`);
  }
}

// ---------------------------------------------------------------------------
// Auth / Cookie helpers
// ---------------------------------------------------------------------------

function base64UrlEncode(str) {
  return Buffer.from(str, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildCookieHeader(session) {
  const json = JSON.stringify([
    session.access_token,
    session.refresh_token,
    null,
    null,
    null,
  ]);
  // @supabase/ssr stores the Session object JSON as base64url with base64- prefix.
  // But the common current format stores a compressed array. Let's stringify the full session object instead.
  const full = JSON.stringify({
    access_token: session.access_token,
    token_type: session.token_type,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    refresh_token: session.refresh_token,
    user: session.user,
  });
  const encoded = "base64-" + base64UrlEncode(full);
  // Chunk at 3180 chars (same as supabase-js)
  const MAX = 3180;
  if (encoded.length <= MAX) {
    return `${COOKIE_NAME}=${encoded}`;
  }
  const chunks = [];
  for (let i = 0, idx = 0; i < encoded.length; i += MAX, idx += 1) {
    chunks.push(`${COOKIE_NAME}.${idx}=${encoded.slice(i, i + MAX)}`);
  }
  return chunks.join("; ");
}

async function apiFetch(cookie, path, init = {}) {
  const res = await fetch(`${APP_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      cookie,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, body: json ?? text };
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

const stamp = Date.now();
const testEmail = `nka-e2e-${stamp}@immohub-test.invalid`;
const testPassword = `ImmoNKA-${stamp}!`;
const stranger2Email = `nka-e2e-stranger-${stamp}@immohub-test.invalid`;

let userId;
let strangerUserId;
let propertyId;
const unitIds = {};
const tenantIds = {};
const transactionIds = [];

async function createAuthUser(emailAddr, pw) {
  const { data, error } = await admin.auth.admin.createUser({
    email: emailAddr,
    password: pw,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user.id;
}

async function seed() {
  section("Seed");

  userId = await createAuthUser(testEmail, testPassword);
  strangerUserId = await createAuthUser(stranger2Email, testPassword);
  info(`Test-User: ${testEmail} · id=${userId}`);
  info(`Stranger-User (für RLS-Check): ${stranger2Email} · id=${strangerUserId}`);

  // Property: Wohnfläche 200 m², 4 Einheiten
  const { data: prop, error: propErr } = await admin
    .from("properties")
    .insert({
      user_id: userId,
      name: "NKA-E2E Testhaus",
      address: "Musterstraße 1, 12345 Teststadt",
      type: "wohnhaus",
      wohnflaeche_gesamt_m2: 200,
      anzahl_einheiten: 4,
      ist_weg: false,
    })
    .select()
    .single();
  if (propErr) throw propErr;
  propertyId = prop.id;
  info(`Property: ${propertyId} · Gesamt-Wohnfläche 200 m² · 4 Einheiten`);

  // Units
  const unitsToCreate = [
    { key: "WE1", label: "WE 1 (EG)", area_sqm: 80 },  // 80 m²
    { key: "WE2", label: "WE 2 (1. OG)", area_sqm: 60 },  // 60 m²
    { key: "WE3", label: "WE 3 (2. OG)", area_sqm: 40 },  // 40 m²
    { key: "WE4", label: "WE 4 (DG)",   area_sqm: 20 },  // 20 m²  (meiste Zeit leerstehend)
  ];
  for (const u of unitsToCreate) {
    const { data, error } = await admin
      .from("units")
      .insert({
        property_id: propertyId,
        label: u.label,
        unit_type: "residential",
        area_sqm: u.area_sqm,
        is_active: true,
      })
      .select()
      .single();
    if (error) throw error;
    unitIds[u.key] = data.id;
  }
  info(`Units: WE1=80m², WE2=60m², WE3=40m², WE4=20m² (Summe 200m²)`);

  // Tenants — different scenarios for period 2025-01-01 .. 2025-12-31
  // Period: 365 Tage.
  const PERIOD_VON = "2025-01-01";
  const PERIOD_BIS = "2025-12-31";

  const tenantsToCreate = [
    {
      key: "T_WE1_VOLL",
      unit_id: unitIds.WE1,
      first_name: "Anna",
      last_name: "Volljahr",
      email: "anna.volljahr@test.invalid",
      lease_start: "2024-01-01",
      lease_end: null,                        // aktiv, volle Periode
      cold_rent_cents: 80000,
      additional_costs_cents: 15000,          // 150 €/Monat VZ
      personen_anzahl: 2,
      anteil_wohnflaeche_m2: 80,
    },
    {
      key: "T_WE2_UNTERJAHR",
      unit_id: unitIds.WE2,
      first_name: "Bernd",
      last_name: "Halbjahr",
      email: "bernd.halbjahr@test.invalid",
      lease_start: "2025-07-01",              // Einzug mitten im Jahr
      lease_end: null,
      cold_rent_cents: 60000,
      additional_costs_cents: 10000,          // 100 €/Monat VZ
      personen_anzahl: 1,
      anteil_wohnflaeche_m2: 60,
    },
    {
      key: "T_WE3_AUSZUG",
      unit_id: unitIds.WE3,
      first_name: "Carla",
      last_name: "Auszieher",
      email: "carla.auszieher@test.invalid",
      lease_start: "2024-01-01",
      lease_end: "2025-06-30",                // Auszug zur Jahresmitte
      cold_rent_cents: 40000,
      additional_costs_cents: 8000,           // 80 €/Monat VZ
      personen_anzahl: 3,
      anteil_wohnflaeche_m2: 40,
    },
    // WE4 bleibt leer in der gesamten Periode (kein Mieter)
  ];
  for (const t of tenantsToCreate) {
    const { data, error } = await admin
      .from("tenants")
      .insert({
        unit_id: t.unit_id,
        first_name: t.first_name,
        last_name: t.last_name,
        email: t.email,
        lease_start: t.lease_start,
        lease_end: t.lease_end,
        cold_rent_cents: t.cold_rent_cents,
        additional_costs_cents: t.additional_costs_cents,
        deposit_cents: 0,
        rent_type: "fixed",
        status: "active",
        personen_anzahl: t.personen_anzahl,
        anteil_wohnflaeche_m2: t.anteil_wohnflaeche_m2,
      })
      .select()
      .single();
    if (error) throw error;
    tenantIds[t.key] = data.id;
  }
  info(`Tenants: Anna (WE1 voll, 2P, 150€ VZ) · Bernd (WE2 ab 1.7., 1P, 100€ VZ) · Carla (WE3 bis 30.6., 3P, 80€ VZ) · WE4 leer`);

  return { PERIOD_VON, PERIOD_BIS };
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

async function login(email, password) {
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Login fehlgeschlagen: ${error.message}`);
  return buildCookieHeader(data.session);
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

async function scenarioLifecycle(cookie, PERIOD_VON, PERIOD_BIS) {
  section("Szenario 1 – Periode anlegen, manuelle Kostenposition, Recalculate");

  // 1. Try overlapping period before: nothing exists yet, so just create
  const createRes = await apiFetch(cookie, "/api/nka/periods", {
    method: "POST",
    body: JSON.stringify({
      property_id: propertyId,
      zeitraum_von: PERIOD_VON,
      zeitraum_bis: PERIOD_BIS,
    }),
  });
  if (createRes.status !== 201) {
    fail(`Periode anlegen: HTTP ${createRes.status} · ${JSON.stringify(createRes.body)}`);
    throw new Error("Cannot continue without period");
  }
  const period = createRes.body;
  ok(`Periode angelegt: id=${period.id}, status=${period.status}, deadline=${period.deadline_abrechnung}`);

  // Expected deadline: 2025-12-31 + 12 months = 2026-12-31
  expect("Deadline-Generated-Column", period.deadline_abrechnung, "2026-12-31");

  // 2. Overlap detection
  const overlapRes = await apiFetch(cookie, "/api/nka/periods", {
    method: "POST",
    body: JSON.stringify({
      property_id: propertyId,
      zeitraum_von: "2025-06-01",
      zeitraum_bis: "2026-05-31",
    }),
  });
  expect("Überlappende Periode wird abgelehnt (409)", overlapRes.status, 409);

  // 3. Add manual cost item: Gebäudeversicherung 1200 €, umlagefähig, Umlage=Wohnfläche
  const costRes1 = await apiFetch(cookie, `/api/nka/periods/${period.id}/cost-items`, {
    method: "POST",
    body: JSON.stringify({
      bezeichnung: "Gebäudeversicherung 2025",
      betr_kv_position: 13,
      betrag_brutto: 1200,
      umlageschluessel: "wohnflaeche",
      ist_umlagefaehig: true,
    }),
  });
  if (costRes1.status !== 200) fail(`Cost item 1: HTTP ${costRes1.status} · ${JSON.stringify(costRes1.body)}`);
  else ok(`Cost item 1 angelegt, Summe umlagefähig=${costRes1.body.summary?.gesamtkosten_umlagefaehig}`);

  // 4. Add nicht-umlagefähige Position: Instandhaltung Dach 800 €
  const costRes2 = await apiFetch(cookie, `/api/nka/periods/${period.id}/cost-items`, {
    method: "POST",
    body: JSON.stringify({
      bezeichnung: "Dach-Instandhaltung",
      betr_kv_position: 17,
      betrag_brutto: 800,
      umlageschluessel: "wohnflaeche",
      ist_umlagefaehig: false,
    }),
  });
  if (costRes2.status !== 200) fail(`Cost item 2: HTTP ${costRes2.status}`);
  else {
    expect("Summe umlagefähig bleibt bei 1200 €", costRes2.body.summary?.gesamtkosten_umlagefaehig, 1200);
    expect("Summe nicht umlagefähig = 800 €", costRes2.body.summary?.gesamtkosten_nicht_umlagefaehig, 800);
  }

  // 5. Add Müllabfuhr 400 €, umlagefähig, Umlage=Einheiten
  await apiFetch(cookie, `/api/nka/periods/${period.id}/cost-items`, {
    method: "POST",
    body: JSON.stringify({
      bezeichnung: "Müllabfuhr",
      betr_kv_position: 8,
      betrag_brutto: 400,
      umlageschluessel: "einheiten",
      ist_umlagefaehig: true,
    }),
  });

  // 6. Add Wasser 600 €, umlagefähig, Umlage=Personen
  await apiFetch(cookie, `/api/nka/periods/${period.id}/cost-items`, {
    method: "POST",
    body: JSON.stringify({
      bezeichnung: "Wasser/Abwasser",
      betr_kv_position: 2,
      betrag_brutto: 600,
      umlageschluessel: "personen",
      ist_umlagefaehig: true,
    }),
  });

  // Nach 4 cost items: umlagefähig = 1200 + 400 + 600 = 2200; nicht = 800
  // 7. Fetch Periode und tenant_shares
  const detailRes = await apiFetch(cookie, `/api/nka/periods/${period.id}`);
  if (detailRes.status !== 200) {
    fail(`GET period detail: HTTP ${detailRes.status}`);
    return period;
  }

  subsection("Erwartete tenant_shares");
  // Handrechnung Periode 2025-01-01 .. 2025-12-31 (365 Tage)
  // Anteil Wohnfläche: 80 + 60 + 40 = 180 m² (WE4 leer) aus Mietern,
  //   property.wohnflaeche_gesamt_m2 = 200 → Code nimmt max(200, 180) = 200
  // Personen-Summe: 2 + 1 + 3 = 6 (nur überlappende Mieter in Periode)
  //   ABER: Code nimmt personen aus ALLEN tenants, aber share nur für die mit Overlap.
  //   Bei Carla: bewohnt_von=2025-01-01, bewohnt_bis=2025-06-30 → tage=181
  //   Bei Anna:  bewohnt_von=2025-01-01, bewohnt_bis=2025-12-31 → tage=365
  //   Bei Bernd: bewohnt_von=2025-07-01, bewohnt_bis=2025-12-31 → tage=184
  // periodDays = 365
  // totalArea = 200 (property override)
  // totalPersons = 2 + 1 + 3 = 6  (summe aus overlap-mietern geht ins totalPersons ein; code nimmt aus ALLEN tenants input)
  //   ACHTUNG: computeTenantShares verwendet `tenants` (alle), totalPersons = sum(personen für alle tenants im Input) = 2+1+3 = 6. OK.
  // totalUnits = 4 (anzahl_einheiten)

  // Umlagefähige Kosten pro Position:
  //  - Gebäudeversicherung 1200 €, wohnflaeche
  //  - Müllabfuhr 400 €, einheiten
  //  - Wasser 600 €, personen
  const totalArea = 200;
  const totalPersons = 6;
  const totalUnits = 4;
  const periodDays = 365;

  const shares = detailRes.body.tenant_shares;
  ok(`tenant_shares Count: ${shares.length}`);

  function expectedShare({ area, persons, days }) {
    const timeShare = days / periodDays;
    const fromWohnflaeche = 1200 * (area / totalArea) * timeShare;
    const fromEinheiten = 400 * (1 / totalUnits) * timeShare;
    const fromPersonen = 600 * (persons / totalPersons) * timeShare;
    return Math.round((fromWohnflaeche + fromEinheiten + fromPersonen) * 100) / 100;
  }

  const annaExpected = expectedShare({ area: 80, persons: 2, days: 365 });
  const berndExpected = expectedShare({ area: 60, persons: 1, days: 184 });
  const carlaExpected = expectedShare({ area: 40, persons: 3, days: 181 });
  info(`Expected: Anna=${annaExpected} · Bernd=${berndExpected} · Carla=${carlaExpected}`);

  // Vorauszahlungen
  // monthlyAdvanceForDays(cents, days) = cents/100 * (days/30.4167)
  // Anna 150€ * 365/30.4167 = 150 * 11.9999... ≈ 1800.00
  // Bernd 100€ * 184/30.4167 ≈ 604.93
  // Carla 80€ * 181/30.4167 ≈ 476.09
  const annaVzExpected = Math.round(150 * (365 / 30.4167) * 100) / 100;
  const berndVzExpected = Math.round(100 * (184 / 30.4167) * 100) / 100;
  const carlaVzExpected = Math.round(80 * (181 / 30.4167) * 100) / 100;

  const annaShare = shares.find((s) => s.mieter_id === tenantIds.T_WE1_VOLL);
  const berndShare = shares.find((s) => s.mieter_id === tenantIds.T_WE2_UNTERJAHR);
  const carlaShare = shares.find((s) => s.mieter_id === tenantIds.T_WE3_AUSZUG);

  if (!annaShare) fail("Anna share fehlt");
  else {
    expect("Anna tage_anteil = 365", annaShare.tage_anteil, 365);
    expect("Anna bewohnt_von", annaShare.bewohnt_von, "2025-01-01");
    expect("Anna bewohnt_bis", annaShare.bewohnt_bis, "2025-12-31");
    expect("Anna summe_anteile", Number(annaShare.summe_anteile), annaExpected);
    expect("Anna summe_vorauszahlungen", Number(annaShare.summe_vorauszahlungen), annaVzExpected);
    expect("Anna nachzahlung_oder_guthaben (generated)", Number(annaShare.nachzahlung_oder_guthaben), Number((annaShare.summe_anteile - annaShare.summe_vorauszahlungen).toFixed(2)));
  }
  if (!berndShare) fail("Bernd share fehlt");
  else {
    expect("Bernd tage_anteil = 184", berndShare.tage_anteil, 184);
    expect("Bernd bewohnt_von", berndShare.bewohnt_von, "2025-07-01");
    expect("Bernd bewohnt_bis", berndShare.bewohnt_bis, "2025-12-31");
    expect("Bernd summe_anteile", Number(berndShare.summe_anteile), berndExpected);
    expect("Bernd summe_vorauszahlungen", Number(berndShare.summe_vorauszahlungen), berndVzExpected);
  }
  if (!carlaShare) fail("Carla share fehlt");
  else {
    expect("Carla tage_anteil = 181", carlaShare.tage_anteil, 181);
    expect("Carla bewohnt_von", carlaShare.bewohnt_von, "2025-01-01");
    expect("Carla bewohnt_bis", carlaShare.bewohnt_bis, "2025-06-30");
    expect("Carla summe_anteile", Number(carlaShare.summe_anteile), carlaExpected);
    expect("Carla summe_vorauszahlungen", Number(carlaShare.summe_vorauszahlungen), carlaVzExpected);
  }

  return period;
}

async function scenarioDelete(cookie, period) {
  section("Szenario 2 – Cost Item löschen + Recalculate");
  // Fetch first cost item id
  const detailRes = await apiFetch(cookie, `/api/nka/periods/${period.id}`);
  const firstItemId = detailRes.body.cost_items[0].id;
  const delRes = await apiFetch(cookie, `/api/nka/periods/${period.id}/cost-items/${firstItemId}`, { method: "DELETE" });
  expect("DELETE cost-item status 200", delRes.status, 200);
  const afterRes = await apiFetch(cookie, `/api/nka/periods/${period.id}`);
  ok(`Nach Löschung: ${afterRes.body.cost_items.length} Positionen, Summe umlagefähig=${afterRes.body.period.gesamtkosten_umlagefaehig}`);
}

async function scenarioAutofill(cookie, PERIOD_VON, PERIOD_BIS) {
  section("Szenario 3 – Autofill aus Transaktionen");

  // Seed some transactions in the test property
  const txToCreate = [
    {
      property_id: propertyId,
      user_id: userId,
      date: "2025-03-15",
      amount: -250,
      description: "Strom Allgemein Q1",
      counterpart: "Stadtwerke",
      category: "Beleuchtung (BetrKV 11)",
      source: "csv_import",
      import_hash: `test-${stamp}-1`,
    },
    {
      property_id: propertyId,
      user_id: userId,
      date: "2025-06-20",
      amount: -180,
      description: "Grundsteuer Q2",
      counterpart: "Stadt",
      category: "Grundsteuer", // nicht in BetrKV-Seed → sollte verworfen werden
      source: "csv_import",
      import_hash: `test-${stamp}-2`,
    },
    {
      property_id: propertyId,
      user_id: userId,
      date: "2025-08-10",
      amount: -500,
      description: "Heizöl-Lieferung",
      counterpart: "Öl-Müller",
      category: "Heizung / Wärme (BetrKV 4)",
      source: "csv_import",
      import_hash: `test-${stamp}-3`,
    },
    {
      property_id: propertyId,
      user_id: userId,
      date: "2025-11-05",
      amount: -150,
      description: "Hauswart November",
      counterpart: "Hauswart-GmbH",
      category: "Hauswart (BetrKV 14)",
      source: "csv_import",
      import_hash: `test-${stamp}-4`,
    },
    {
      property_id: propertyId,
      user_id: userId,
      date: "2024-12-15",  // außerhalb Periode
      amount: -100,
      description: "Vorjahr Test",
      counterpart: "Test",
      category: "Hauswart (BetrKV 14)",
      source: "csv_import",
      import_hash: `test-${stamp}-5`,
    },
    {
      property_id: propertyId,
      user_id: userId,
      date: "2025-04-01",
      amount: 800,  // positiv (Einnahme), wird gefiltert (außer Kategorie ist "ausgabe")
      description: "Miete Anna",
      counterpart: "Volljahr",
      category: "Miete",
      source: "csv_import",
      import_hash: `test-${stamp}-6`,
    },
  ];
  for (const tx of txToCreate) {
    const { data, error } = await admin.from("transactions").insert(tx).select().single();
    if (error) throw error;
    transactionIds.push(data.id);
  }
  info(`${txToCreate.length} Test-Transaktionen angelegt (3 sollten in Autofill landen: Beleuchtung, Heizung, Hauswart)`);

  // Erstelle eine frische Periode für 2024 (damit Autofill-Scope isoliert testbar) — oder nutze bestehende
  // Einfacher: Nutze die bestehende 2025er-Periode und rufe Autofill auf
  const periodsList = await apiFetch(cookie, `/api/nka/periods?property_id=${propertyId}`);
  const period = periodsList.body[0];

  const autofillRes = await apiFetch(cookie, `/api/nka/periods/${period.id}/autofill`, { method: "POST" });
  if (autofillRes.status !== 200) {
    fail(`Autofill: HTTP ${autofillRes.status} · ${JSON.stringify(autofillRes.body)}`);
    return;
  }
  ok(`Autofill: imported_positions=${autofillRes.body.imported_positions}`);
  expect("Autofill importierte 3 Positionen (Beleuchtung, Heizung, Hauswart)", autofillRes.body.imported_positions, 3);
  expect("Status nach Autofill = 'in_bearbeitung'", (await apiFetch(cookie, `/api/nka/periods/${period.id}`)).body.period.status, "in_bearbeitung");

  // Kostensumme durch Autofill: 250 + 500 + 150 = 900 + manuelle Positionen (ohne die gelöschte)
  // Aus Szenario 1 wurden 4 Positionen angelegt, dann Szenario 2 hat eine gelöscht -> 3 manuelle übrig.
  // Aber: Autofill löscht alle Positionen mit quelle='transaktion' vor dem Insert (löscht also nichts bei erstem Aufruf).
  const afterRes = await apiFetch(cookie, `/api/nka/periods/${period.id}`);
  const items = afterRes.body.cost_items;
  const tx_items = items.filter((i) => i.quelle === "transaktion");
  const manual_items = items.filter((i) => i.quelle === "manuell");
  info(`Nach Autofill: ${tx_items.length} tx-Positionen + ${manual_items.length} manuelle Positionen`);
  expect("3 Positionen aus Transaktionen", tx_items.length, 3);

  // BetrKV-Positionen korrekt übernommen?
  const posSet = new Set(tx_items.map((i) => i.betr_kv_position));
  ok(`BetrKV-Positionen von Autofill: ${[...posSet].sort().join(", ")}`);
  if (!posSet.has(4) || !posSet.has(11) || !posSet.has(14)) fail("Erwartet BetrKV 4, 11, 14 aus Autofill");
  else ok("BetrKV 4, 11, 14 korrekt klassifiziert");

  // Summe umlagefähig sollte gestiegen sein (alte manuelle Summen + 900 € Autofill)
  const newSum = Number(afterRes.body.period.gesamtkosten_umlagefaehig);
  info(`Neue Summe umlagefähig: ${newSum} €`);

  // Idempotenz: erneut Autofill aufrufen, sollte nicht duplizieren
  const autofill2 = await apiFetch(cookie, `/api/nka/periods/${period.id}/autofill`, { method: "POST" });
  expect("Idempotent: 2. Autofill importiert wieder 3", autofill2.body.imported_positions, 3);
  const after2 = await apiFetch(cookie, `/api/nka/periods/${period.id}`);
  const tx_items2 = after2.body.cost_items.filter((i) => i.quelle === "transaktion");
  expect("Nach 2. Autofill weiterhin 3 tx-Positionen (keine Duplikate)", tx_items2.length, 3);
}

async function scenarioDeadline(cookie) {
  section("Szenario 4 – Deadline-Status in der Liste");

  // Lege eine zweite Periode an, deren Deadline in der Vergangenheit liegt (2020er Periode)
  const { data: oldPeriod, error } = await admin
    .from("nka_periods")
    .insert({
      property_id: propertyId,
      user_id: userId,
      zeitraum_von: "2020-01-01",
      zeitraum_bis: "2020-12-31",
      status: "offen",
    })
    .select()
    .single();
  if (error) {
    fail(`Alte Periode: ${error.message}`);
    return;
  }
  info(`Alte Periode 2020: deadline=${oldPeriod.deadline_abrechnung}`);

  // Query status monitor view
  const { data: view } = await admin.from("v_nka_status_monitor").select("*").eq("property_id", propertyId);
  const match = view?.find((r) => r.id === oldPeriod.id);
  if (!match) fail("Periode nicht in v_nka_status_monitor");
  else expect("Alte Periode deadline_status=critical", match.deadline_status, "critical");

  // Aktuelle Periode (2025) hat deadline 2026-12-31 → Heute ist 2026-04-19
  // Tage bis 2026-12-31 = ~256 → > 90 Tage → status "ok"
  const { data: view2025 } = await admin
    .from("v_nka_status_monitor")
    .select("*")
    .eq("property_id", propertyId);
  const match2025 = view2025?.find((r) => r.zeitraum_bis === "2025-12-31");
  if (match2025) expect("2025er Periode deadline_status=ok (>90 Tage)", match2025.deadline_status, "ok");
}

async function scenarioRls(periodId) {
  section("Szenario 5 – RLS: Fremd-User darf nicht zugreifen");

  const strangerCookie = await login(stranger2Email, testPassword);

  // Liste fremder Perioden
  const listRes = await apiFetch(strangerCookie, `/api/nka/periods?property_id=${propertyId}`);
  expect("Stranger listet Perioden (leer erwartet)", Array.isArray(listRes.body) && listRes.body.length, 0);

  // GET fremde Periode
  const getRes = await apiFetch(strangerCookie, `/api/nka/periods/${periodId}`);
  expect("Stranger GET Periode → 404", getRes.status, 404);

  // POST cost item in fremde Periode
  const postRes = await apiFetch(strangerCookie, `/api/nka/periods/${periodId}/cost-items`, {
    method: "POST",
    body: JSON.stringify({
      bezeichnung: "Hackversuch",
      betr_kv_position: 17,
      betrag_brutto: 1,
      umlageschluessel: "wohnflaeche",
      ist_umlagefaehig: true,
    }),
  });
  expect("Stranger POST cost-item → 404", postRes.status, 404);

  // Autofill fremde Periode
  const autoRes = await apiFetch(strangerCookie, `/api/nka/periods/${periodId}/autofill`, { method: "POST" });
  expect("Stranger Autofill → 404", autoRes.status, 404);
}

async function scenarioValidation(cookie, periodId) {
  section("Szenario 6 – Input-Validierung");

  // Missing body
  const r1 = await apiFetch(cookie, "/api/nka/periods", {
    method: "POST",
    body: JSON.stringify({ property_id: propertyId }),
  });
  expect("POST /periods ohne Zeitraum → 400", r1.status, 400);

  // Invalid property_id
  const r2 = await apiFetch(cookie, "/api/nka/periods", {
    method: "POST",
    body: JSON.stringify({ property_id: randomUUID(), zeitraum_von: "2027-01-01", zeitraum_bis: "2027-12-31" }),
  });
  expect("POST /periods mit fremder property_id → 404", r2.status, 404);

  // cost-item Bezeichnung fehlt
  const r3 = await apiFetch(cookie, `/api/nka/periods/${periodId}/cost-items`, {
    method: "POST",
    body: JSON.stringify({ betr_kv_position: 13, betrag_brutto: 100, umlageschluessel: "wohnflaeche" }),
  });
  expect("cost-item ohne Bezeichnung → 400", r3.status, 400);

  // Negative Betrag
  const r4 = await apiFetch(cookie, `/api/nka/periods/${periodId}/cost-items`, {
    method: "POST",
    body: JSON.stringify({ bezeichnung: "Test", betr_kv_position: 13, betrag_brutto: -100, umlageschluessel: "wohnflaeche" }),
  });
  expect("cost-item mit negativem Betrag → 400", r4.status, 400);

  // Ungültige BetrKV-Position
  const r5 = await apiFetch(cookie, `/api/nka/periods/${periodId}/cost-items`, {
    method: "POST",
    body: JSON.stringify({ bezeichnung: "Test", betr_kv_position: 99, betrag_brutto: 100, umlageschluessel: "wohnflaeche" }),
  });
  expect("cost-item mit BetrKV=99 → 400", r5.status, 400);
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

async function cleanup() {
  section("Cleanup");
  // Transactions entfernen
  if (transactionIds.length > 0) {
    const { error } = await admin.from("transactions").delete().in("id", transactionIds);
    if (error) fail(`Transactions löschen: ${error.message}`);
    else ok(`${transactionIds.length} Transaktionen gelöscht`);
  }
  // auth.users → CASCADE entfernt property + units + tenants + nka_periods + cost_items + tenant_shares
  for (const uid of [userId, strangerUserId].filter(Boolean)) {
    const { error } = await admin.auth.admin.deleteUser(uid);
    if (error) fail(`User ${uid} löschen: ${error.message}`);
    else ok(`User ${uid} gelöscht (CASCADE)`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

try {
  report.push(`# NKA E2E Test Report\n\nDatum: ${new Date().toISOString()}\nProject: ${PROJECT_REF}\n`);
  const { PERIOD_VON, PERIOD_BIS } = await seed();
  const cookie = await login(testEmail, testPassword);
  const period = await scenarioLifecycle(cookie, PERIOD_VON, PERIOD_BIS);
  await scenarioDelete(cookie, period);
  await scenarioAutofill(cookie, PERIOD_VON, PERIOD_BIS);
  await scenarioDeadline(cookie);
  await scenarioRls(period.id);
  await scenarioValidation(cookie, period.id);
} catch (e) {
  fail(`Uncaught: ${e.stack || e.message}`);
} finally {
  try { await cleanup(); } catch (e) { console.error("cleanup failed", e); }
  const reportPath = "/Users/leotacke/Documents/Privat/Immohub/myimmohub/.claude/worktrees/vigorous-visvesvaraya-bb5551/scripts/nka-e2e/REPORT.md";
  writeFileSync(reportPath, report.join("\n") + "\n");
  log(`\nReport geschrieben: ${reportPath}`);
}
