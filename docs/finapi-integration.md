# Finapi-Integration

**Stand:** April 2026
**Finapi-Dokumentation:** https://docs.finapi.io
**Finapi-Dashboard:** https://finapi.io (Account erforderlich)

---

## Überblick

Finapi ist ein deutscher PSD2-konformer Account-Information-Service (AIS). Nutzer verbinden
ihr Bankkonto einmalig über einen OAuth-ähnlichen Webflow (FinAPI Web Form); anschließend
ruft das Backend Transaktionen automatisch per REST-API ab — ohne weiteren manuellen
CSV-Export.

Der CSV-Import bleibt als Fallback für Banken erhalten, die nicht im Finapi-Netzwerk sind.

---

## Was muss getan werden?

### 1 · Finapi-Account & API-Keys einrichten

- Sandbox-Account anlegen: https://finapi.io/get-started
- Client-ID und Client-Secret für die Sandbox besorgen
- Später: Production-Account beantragen (Zertifizierungsprozess nach PSD2)
- Webhook-Secret für signierte Callbacks konfigurieren

**Zeitaufwand:** ½ Tag (Sandbox) + mehrere Wochen für Produktion (regulatorisch)

---

### 2 · Datenbank: Finapi-Verbindungen speichern

Neue Migrationsdatei `supabase/migrations/YYYYMMDD_finapi_connections.sql`:

```sql
CREATE TABLE finapi_connections (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  property_id         UUID REFERENCES properties ON DELETE SET NULL,

  -- Finapi-seitige IDs
  finapi_user_id      TEXT NOT NULL,          -- Finapi-interne Nutzer-ID
  finapi_account_id   TEXT NOT NULL,          -- Referenziertes Bankkonto
  bank_name           TEXT,                   -- Anzeigename ("ING", "Sparkasse …")
  iban                TEXT,                   -- Maskiert: DE**************1234

  -- OAuth-Token (verschlüsselt ablegen, niemals im Klartext)
  access_token        TEXT NOT NULL,
  refresh_token       TEXT NOT NULL,
  token_expires_at    TIMESTAMPTZ NOT NULL,

  -- Sync-Status
  last_synced_at      TIMESTAMPTZ,
  sync_status         TEXT DEFAULT 'active',  -- 'active' | 'error' | 'disconnected'
  sync_error          TEXT,

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Zugriff nur für den jeweiligen Nutzer
ALTER TABLE finapi_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Eigene Verbindungen" ON finapi_connections
  USING (auth.uid() = user_id);
```

**Wichtig:** `access_token` und `refresh_token` vor dem Speichern mit einem
KMS oder Supabase Vault verschlüsseln — niemals im Klartext in die DB schreiben.

---

### 3 · Backend: OAuth-Flow (Bank verbinden)

Drei neue API-Routen:

#### `POST /api/banking/finapi/connect`
- Erstellt einen Finapi-User für den eingeloggten Nutzer (falls noch nicht vorhanden)
- Startet den FinAPI Web Form: gibt eine `redirectUrl` zurück
- Das Frontend öffnet diese URL in einem Modal oder Popup

#### `GET /api/banking/finapi/callback`
- Empfängt den OAuth-Callback nach erfolgreicher Bankverbindung
- Tauscht den Authorization-Code gegen Access-Token + Refresh-Token
- Speichert die Verbindung in `finapi_connections`
- Leitet auf `/dashboard/banking/connect?success=1` weiter

#### `POST /api/banking/finapi/disconnect`
- Widerruft den Token bei Finapi
- Löscht die Zeile aus `finapi_connections`

**Zeitaufwand:** 2–3 Tage

---

### 4 · Backend: Transaktionen abrufen (Sync)

#### `POST /api/banking/finapi/sync` (manueller Trigger)
- Holt neue Transaktionen seit `last_synced_at` via Finapi REST API
- Mappt das Finapi-Transaktionsformat auf unser `ParsedTransaction`-Schema
- Ruft `importTransactions()` aus `lib/banking/importTransactions.ts` auf
  — der `import_hash`-Mechanismus verhindert Duplikate automatisch
- Aktualisiert `last_synced_at` in `finapi_connections`

#### `POST /api/banking/finapi/webhook` (automatischer Push)
- Finapi schickt bei neuen Transaktionen einen signierten HTTP-POST
- Signatur mit `FINAPI_WEBHOOK_SECRET` verifizieren (HMAC-SHA256)
- Delegiert an dieselbe Sync-Logik wie der manuelle Trigger

**Zeitaufwand:** 2–3 Tage

---

### 5 · `FinapiBankingService` implementieren

Datei: `lib/banking/FinapiBankingService.ts` (Stub existiert bereits)

```typescript
// getTransactions
// → Supabase-Query (identisch zu CSVBankingService — Transaktionen liegen
//   bereits in derselben transactions-Tabelle, source = 'finapi')

// importFromCSV
// → Für Finapi nicht sinnvoll; wirft weiterhin einen Fehler oder
//   delegiert an CSVBankingService als Fallback für nicht-verbundene Banken

// getAccountBalance
// → Identisch zu CSVBankingService — rechnet über dieselbe transactions-Tabelle
```

Da Finapi-Transaktionen nach dem Sync in der bestehenden `transactions`-Tabelle
mit `source = 'finapi'` landen, sind `getTransactions` und `getAccountBalance`
**praktisch identisch** zu `CSVBankingService`. Der einzige echte Unterschied
liegt im Import-Kanal (Webhook/Sync statt CSV-Upload).

**Zeitaufwand:** ½ Tag

---

### 6 · Frontend: Connect-Seite aktivieren

Datei: `app/dashboard/banking/connect/page.tsx` (existiert bereits)

- „Coming Soon"-Karte aktivieren: `opacity-60` und disabled-Styling entfernen
- Karte verlinkt auf `POST /api/banking/finapi/connect` → erhält `redirectUrl`
- `redirectUrl` in einem `window.open()` Popup öffnen (Finapi Web Form)
- Nach OAuth-Callback: Seite zeigt verbundenes Konto mit IBAN, Bank-Logo, Status

**Zeitaufwand:** 1 Tag

---

### 7 · Umgebungsvariablen

In `.env.local` ergänzen:

```env
# Finapi API
FINAPI_CLIENT_ID=...
FINAPI_CLIENT_SECRET=...
FINAPI_WEBHOOK_SECRET=...
FINAPI_BASE_URL=https://sandbox.finapi.io    # Prod: https://live.finapi.io

# Token-Verschlüsselung (32-Byte-Key, z. B. via `openssl rand -hex 32`)
FINAPI_TOKEN_ENCRYPTION_KEY=...
```

---

## Welche Dateien müssen geändert werden?

| Datei | Änderung |
|---|---|
| `lib/banking/FinapiBankingService.ts` | Alle drei Methoden implementieren |
| `app/dashboard/banking/connect/page.tsx` | „Coming Soon"-Karte aktivieren, OAuth-Flow einbauen |
| `.env.local` + `.env.example` | Finapi-Keys ergänzen |

---

## Was bleibt unverändert?

| Datei / Bereich | Grund |
|---|---|
| `lib/banking/BankingService.ts` | Interface ist bereits quellenneutral — kein Anpassungsbedarf |
| `lib/banking/CSVBankingService.ts` | Bleibt als Fallback für nicht-verbundene Banken |
| `lib/banking/parseCSV.ts` | Nur für CSV-Kanal relevant, unberührt |
| `lib/banking/importTransactions.ts` | Wird vom Finapi-Sync **wiederverwendet** — kein Duplikat-Code nötig |
| `lib/banking/categorizeTransaction.ts` | Kategorisierung ist quellenneutral; `source`-Feld ignoriert |
| `lib/banking/splitTransaction.ts` | Funktioniert mit allen Transaktionen unabhängig von der Quelle |
| `app/api/banking/categorize/` | Unverändert — kategorisiert alle `category IS NULL`-Zeilen |
| `app/api/banking/split-transaction/` | Unverändert |
| `app/dashboard/banking/review/` | Zeigt alle Transaktionen; `source`-Spalte optional ergänzen |
| `app/dashboard/banking/page.tsx` | Keine Änderung — liest aus `transactions`-Tabelle |
| `lib/calculations/profitability.ts` | Rein rechnerisch, keine Datenquellen-Abhängigkeit |
| Supabase `transactions`-Tabelle | Schema bereits korrekt: `source TEXT` unterscheidet CSV von Finapi |

---

## Aufwandsschätzung

| Aufgabe | Aufwand |
|---|---|
| Finapi Sandbox-Account + API-Exploration | 1 Tag |
| Datenbank-Migration (`finapi_connections`) | ½ Tag |
| OAuth-Flow (connect / callback / disconnect) | 2–3 Tage |
| Sync-Logik + Webhook-Handler | 2–3 Tage |
| `FinapiBankingService` implementieren | ½ Tag |
| Frontend Connect-Seite aktivieren | 1 Tag |
| Tests + Fehlerbehandlung (Token-Refresh, Bank-Fehler) | 2–3 Tage |
| **Gesamt (Sandbox, ohne Produktion)** | **~9–12 Tage** |

> **Hinweis Produktions-Zulassung:** Finapi für Produktion erfordert eine BaFin-registrierte
> PSD2-Lizenz oder die Nutzung über einen lizenzierten TPP (Third Party Provider).
> Dieser regulatorische Prozess ist **nicht** in der Aufwandsschätzung enthalten und
> kann mehrere Monate in Anspruch nehmen.

---

## Empfohlene Reihenfolge

1. Sandbox-Account anlegen und API explorieren (Postman / curl)
2. `finapi_connections`-Migration schreiben und deployen
3. OAuth-Flow backend-seitig implementieren und testen
4. Sync-Route + Webhook implementieren
5. `FinapiBankingService` fertigstellen
6. Connect-Seite im Frontend aktivieren
7. End-to-End-Test: Bank verbinden → Transaktionen landen in Review-Seite → Kategorisierung läuft durch
