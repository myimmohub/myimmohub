# Tax Engine Briefing fuer die Besprechung mit dem Steuerberater

## Ziel dieses Dokuments

Dieses Dokument erklaert die aktuelle Steuerlogik von MyImmoHub so, dass sie fachlich mit einem Steuerberater besprochen und verbessert werden kann.

Es beschreibt:

- welche Eingabedaten die Engine nutzt
- wie Werte fuer Anlage V berechnet werden
- wie PDF-Import und Transaktionsberechnung zusammenhaengen
- wie AfA, Erhaltungsaufwand und GbR/FE-FB behandelt werden
- an welchen Stellen bewusst Heuristiken oder technische Annahmen verwendet werden
- welche fachlichen Prueffragen aus heutiger Sicht besonders relevant sind

Das Dokument ist absichtlich fachlich formuliert. Dateipfade zum Code stehen am Ende als technischer Anhang.

---

## 1. Grundidee der Engine

Die Tax Engine verfolgt zwei grundsaetzliche Wege:

1. **Berechneter Pfad**
   - Steuerdaten werden aus kategorisierten Banktransaktionen, Objektstammdaten und jahresbezogenen Einstellungen erzeugt.
   - Dieser Pfad wird vor allem fuer laufende Jahre oder fuer Objekte ohne PDF-Import genutzt.

2. **Importierter Pfad**
   - Ein vorhandenes ELSTER-/Steuer-PDF wird strukturiert ausgelesen.
   - Dabei werden sowohl einfache Steuerfelder als auch strukturierte Positionen wie AfA-Komponenten oder verteilte Erhaltungsaufwaende uebernommen.

Beide Wege werden anschliessend ueber eine gemeinsame **strukturierte Steuerlogik** harmonisiert. Diese strukturierte Logik ist die zentrale Ebene fuer:

- AfA-Positionen
- Verteilte Erhaltungsaufwaende
- 15%-Pruefung fuer anschaffungsnahe Herstellungskosten
- Aufbereitung fuer Anlage V und GbR/Feststellung

---

## 2. Wichtige Datenquellen

### 2.1 Transaktionen

Transaktionen sind die Basis fuer den berechneten Pfad.

Verwendete Informationen:

- Datum
- Betrag
- Kategorie
- Steuerabzugsflag `is_tax_deductible`
- ggf. legacy `anlage_v_zeile`
- Beschreibung / Gegenpartei fuer Text-Heuristiken

### 2.2 Kategorien

Kategorien steuern die erste Einordnung.

Wichtige Felder:

- `label`
- `typ` (`einnahme` oder `ausgabe`)
- `gruppe`
- ggf. `anlage_v`

### 2.3 Objektstammdaten

Relevante Objektfelder sind unter anderem:

- Kaufpreis
- Gebaeudewert
- Grundwert
- Inventarwert
- Baujahr
- AfA-Satz
- AfA-Jahresbetrag
- Kaufdatum
- Objektart

### 2.4 Jahresbezogene Steuereinstellungen

Wichtige jahresbezogene Einstellungen:

- Eigennutzungstage
- Gesamttage
- optionaler manueller Vermietungsanteil
- weitere steuerliche Settings pro Jahr

### 2.5 Strukturierte Steuer-Items

Die Engine trennt bewusst zwischen dem flachen Datensatz `tax_data` und strukturierten Logikobjekten:

- `tax_depreciation_items`
- `tax_maintenance_distributions`

Diese Items sind entscheidend, weil sie die eigentliche fachliche Logik fuer AfA und verteilte Aufwendungen tragen.

### 2.6 PDF-Importdaten

Beim PDF-Import werden zusaetzlich strukturierte Metadaten gespeichert, insbesondere:

- Expense Blocks
- AfA-Items
- Maintenance Distributions
- GbR-Partnerinformationen

---

## 3. Berechnungslogik fuer Anlage V

## 3.1 Mapping von Transaktionen auf Steuerfelder

Die berechnete Logik arbeitet mehrstufig:

1. Kategorie-Label -> Steuerfeld
2. Kategorie-Gruppe -> Steuerfeld
3. `anlage_v_zeile` -> Steuerfeld
4. historische Slug-Kategorien -> Steuerfeld
5. Text-Heuristik aus Kategorie/Gegenpartei/Beschreibung

Beispiele:

- `Mieteinnahmen` -> `rent_income`
- `Nebenkostenerstattungen` -> `operating_costs_income`
- `Grundsteuer` -> `property_tax`
- `Hausverwaltung / WEG-Kosten` -> `property_management`
- `Handwerkerleistungen` -> `maintenance_costs`
- `Kontofuehrungsgebuehren` -> `bank_fees`
- `Steuerberatung / Rechtskosten` -> `other_expenses`

Wichtig:

- Laufende Betriebskosten werden von der Engine teilweise anders behandelt als Erhaltungsaufwand.
- `Hausmeisterdienste` sind z. B. bewusst **kein** Erhaltungsaufwand, sondern `other_expenses`.

## 3.2 Vorzeichenlogik

Die Engine versucht, Einnahmen und Ausgaben sauber nach Kategorie-Typ zu lesen:

- `typ = einnahme` -> positiver Effekt auf Einnahmen
- `typ = ausgabe` -> negativer Effekt auf Kostenrichtung

Erstattungen oder Gutschriften in Ausgabenkategorien sollen den Aufwand mindern und nicht erhoehen.

## 3.3 Nicht abzugsfaehige Transaktionen

Wenn `is_tax_deductible = false` gesetzt ist, sollen negative Transaktionen nicht in die steuerliche Berechnung einfliessen.

Das ist wichtig fuer:

- private Kosten
- Tilgung
- sonstige nicht abzugsfaehige Bewegungen

## 3.4 Vermietungsanteil / Eigennutzung

Viele Felder werden mit dem Vermietungsanteil gequotelt.

Die Engine unterscheidet:

- automatisch berechneten Vermietungsanteil aus `eigennutzung_tage / gesamt_tage`
- optional manuell gesetzten Override

Die Quotelung wirkt auf einen definierten Satz von Feldern, insbesondere:

- Schuldzinsen
- Grundsteuer
- WEG/Hausgeld / laufende umlagefaehige Kosten
- Versicherungen
- Wasser / Abwasser
- Muell
- Verwaltung
- Bankgebuehren
- sonstige Werbungskosten
- AfA
- Erhaltungsaufwand

Wichtige offene Fachfrage:

- Ist diese pauschale Quotelung fuer alle betroffenen Felder im jetzigen Umfang steuerlich sinnvoll, oder braucht es Ausnahmen je Kostenart?

---

## 4. AfA-Logik

## 4.1 AfA-Quellen

AfA kann aus mehreren Quellen stammen:

1. direkt aus Objektstammdaten
2. aus strukturierten `tax_depreciation_items`
3. aus PDF-Importwerten
4. indirekt ueber Umqualifizierung von Erhaltungsaufwand in Herstellungskosten

## 4.2 AfA-Item-Typen

Die strukturierte Logik kennt drei AfA-Typen:

- `building`
- `outdoor`
- `movable_asset`

Diese werden auf ELSTER-Zeilen gemappt:

- Gebaeude -> `depreciation_building`
- Aussenanlagen -> `depreciation_outdoor`
- Inventar / Ausstattung -> `depreciation_fixtures`

## 4.3 Berechnung der AfA

Jedes AfA-Item hat:

- `gross_annual_amount`
- `apply_rental_ratio`

Wenn `apply_rental_ratio = true`, wird der ELSTER-Wert mit dem Vermietungsanteil gekuerzt.

## 4.4 Importierter vs. berechneter Wert

Die Engine versucht bei importierten Faellen, den offiziellen ELSTER-Wert zu respektieren, statt ihn erneut leicht umzurechnen.

Bei berechneten Faellen wird dagegen eher aus Bruttowerten + Vermietungsquote gearbeitet.

Wichtige offene Fachfrage:

- Soll bei AfA immer der explizit gepflegte Jahreswert fuehrend sein?
- Oder sollen Gebaeudewert, Inventarwert und Satz grundsaetzlich Vorrang vor manuellen Overrides haben?

---

## 5. Erhaltungsaufwand und Verteilungslogik

## 5.1 Zwei Arten von Erhaltungsaufwand

Die Engine trennt bewusst:

1. **sofort abzugsfaehiger Erhaltungsaufwand**
2. **verteilte Erhaltungsaufwaende** nach mehrjaehriger Verteilung

`taxData.maintenance_costs` soll nur den **sofort abzugsfaehigen** Anteil enthalten.

Verteilte Jahresanteile werden **nicht** in dasselbe Feld gemischt, sondern separat in der strukturierten Logik und spaeter in ELSTER-Buckets ausgewiesen.

## 5.2 Struktur eines Verteilungsblocks

Ein `tax_maintenance_distributions`-Eintrag enthaelt u. a.:

- Label
- Ursprungsjahr `source_year`
- Gesamtbetrag
- Klassifikation
- `deduction_mode`
- Verteilungsjahre
- optionalen Jahresanteil-Override
- Zuordnung zu Quelltransaktionen

## 5.3 Mögliche Klassifikationen

- `maintenance_expense`
- `production_cost`
- `depreciation`

## 5.4 Mögliche Abzugsmodi

- `immediate`
- `distributed`

## 5.5 Aktive Verteilung im Steuerjahr

Ein Block gilt nur dann im Zieljahr, wenn:

- Status = aktiv
- Zieljahr innerhalb des Verteilungsfensters liegt

## 5.6 Schutz gegen Doppelerfassung

Die Engine versucht sicherzustellen:

- eine Quelle soll **nicht gleichzeitig** als sofortiger Aufwand und als verteilter Aufwand laufen
- Vorjahresbloecke werden als eigene Jahresanteile gefuehrt
- carry-forward-Bloecke koennen ueber `current_year_share_override` den offiziellen Jahreswert setzen

## 5.7 15%-Pruefung fuer anschaffungsnahe Aufwendungen

Die strukturierte Logik prueft:

- ob innerhalb von 3 Jahren nach Anschaffung relevante Aufwendungen
- fuer `maintenance_expense`
- insgesamt mehr als 15 % der Gebaeudekosten ausmachen

Wenn ja, werden diese Positionen nicht mehr als sofortiger Erhaltungsaufwand behandelt, sondern Richtung Gebaeude-AfA umqualifiziert.

Wichtige offene Fachfragen:

- Entspricht die derzeitige 3-Jahres-/15%-Pruefung dem gewuenschten fachlichen Modell?
- Sind alle beruecksichtigten Kostenarten in dieser Pruefung richtig einbezogen?
- Braucht es Ausschluesse fuer typische Erhaltungspositionen, die steuerlich evtl. anders behandelt werden sollten?

---

## 6. ELSTER-/Anlage-V-Aufbereitung

Die eigentliche Anzeige und der Export werden nicht direkt aus Rohfeldern gebaut, sondern ueber eine Verdichtung.

Die Engine erzeugt:

- Einnahmenbloecke
- Werbungskostenbloecke
- AfA-Bloecke
- Sonderabzugsbloecke

## 6.1 Einnahmen

Typische Buckets:

- Mieteinnahmen
- Umlagen / Nebenkosten
- vereinnahmte Kautionen
- Mietzahlungen fuer Vorjahre
- sonstige Einnahmen

## 6.2 Werbungskosten

Im Fallback-Modell werden Werbungskosten typischerweise in diese Bloecke gruppiert:

- umlagefaehige laufende Kosten
- nicht umlagefaehige Objektkosten
- Finanzierungskosten
- sofortiger Erhaltungsaufwand
- verteilte Erhaltungsaufwaende nach Jahr
- sonstige Werbungskosten

## 6.3 Import-Prioritaet

Wenn importierte Expense Blocks aus dem PDF vorhanden sind, koennen diese Buckets die berechnete Gruppierung uebersteuern oder praegen.

Wichtige offene Fachfragen:

- Ist die aktuelle Bucket-Struktur fuer die Besprechung mit dem Steuerberater fachlich passend?
- Sollen bestimmte Positionen systematisch in andere Bloecke wandern?
- Ist die Trennung von `allocated_costs`, `non_allocated_costs` und `other_expenses` fachlich sauber genug?

---

## 7. GbR / FE-FB-Logik

## 7.1 Grundprinzip

Die GbR-Logik verwendet als Ausgangspunkt dieselbe harmonisierte Steuerbasis wie Anlage V.

Das ist wichtig, damit:

- die Summen zwischen Anlage V und FE/FB konsistent bleiben
- Partnerzuordnungen aus derselben fachlichen Basis erfolgen

## 7.2 Partnerallokation

Partner werden mit Prozentanteilen verteilt.

Pro Partner werden aus den Gesamtsummen abgeleitet:

- Einkuenfte
- Werbungskosten
- AfA
- Sonderabzuege
- Ergebnis vor partnerspezifischen Korrekturen

## 7.3 Sonderwerbungskosten

Partnerspezifische Sonderwerbungskosten werden nach dem kollektiven Ergebnis je Partner abgezogen.

## 7.4 Partnernormalisierung

Es gibt eine Normalisierung und Deduplizierung von Partnernamen, damit importierte Namen und Stammdaten zusammengefuehrt werden koennen.

Wichtige offene Fachfragen:

- Reicht die aktuelle Namensnormalisierung fuer reale Steuerberater-/ELSTER-Konstellationen?
- Soll die Partnerzuordnung ueber stabile IDs statt Namensaehnlichkeit abgesichert werden?

---

## 8. PDF-Importlogik

## 8.1 Ziel

Der PDF-Import soll eine bestehende, bereits abgegebene oder vorbereitete Steuererklaerung moeglichst verlustarm ins System holen.

## 8.2 Technischer Weg

1. PDF wird an die KI-Extraktion gegeben
2. falls noetig OCR-/Text-Fallback
3. Rueckgabe eines strukturierten JSON mit:
   - tax_data-Feldern
   - Partnern
   - Expense Blocks
   - AfA-Items
   - Maintenance Distributions

## 8.3 Besondere Importregeln

Der Prompt erzwingt u. a.:

- Datumswerte ohne Zeitstempel
- Maintenance nicht pauschal in `maintenance_costs`
- Vorjahresbloecke separat
- echte PDF-Jahreswerte fuer verteilte Aufwaende moeglichst als eigene Distributions
- AfA-Items und Expense Blocks nur bei belastbarer Erkennbarkeit

Wichtige offene Fachfragen:

- Welche PDF-Felder muessen steuerlich wirklich fuehrend sein?
- Wo darf der Import Werte nur als Vorschlag anlegen statt direkt als Wahrheit uebernehmen?
- Welche Positionen sollte ein Steuerberater lieber manuell bestaetigen muessen?

---

## 9. Wichtige aktuelle Annahmen und Heuristiken

Diese Punkte sind fachlich besonders review-wuerdig:

### 9.1 Kostenmapping ueber Text und Kategorien

Die Engine nutzt Text-Heuristiken fuer:

- Verwaltung
- Betriebskosten
- Erhaltungsaufwand
- Finanzierung
- sonstige Werbungskosten

Frage:

- Ist die derzeitige Zuordnung bestimmter Begriffe fachlich korrekt und robust genug?

### 9.2 Vollabzug einzelner sonstiger Kosten

Einige Keywords koennen in `other_expenses` einen vollen statt anteiligen Abzug ausloesen.

Frage:

- Welche Positionen duerfen wirklich ungekuerzt laufen, obwohl sonst der Vermietungsanteil angewendet wird?

### 9.3 WEG-/Hausgeld-/Verwaltungstrennung

Es gibt eine technische Trennung zwischen:

- WEG/Hausgeld / umlagefaehige bzw. objektbezogene Kosten
- Hausverwaltung
- sonstigen Verwaltungskosten

Frage:

- Ist diese Trennung in der jetzigen Form steuerlich und praktisch passend?

### 9.4 Verwaltungspauschale und Porto

In Teilen des Systems gibt es Standardannahmen fuer Verwaltungspauschale und Porto, sofern keine eigenen Transaktionen existieren.

Frage:

- Ist das in der jetzigen Form sinnvoll?
- Falls ja: nur als Vorschlag, nur als Override oder fest als Fallback?

### 9.5 Verteilungsbloecke aus Vorjahren

Vorjahresbloecke werden jahresbezogen weitergefuehrt und als eigene Buckets dargestellt.

Frage:

- Ist die aktuelle Logik fuer `source_year`, `distribution_years` und `current_year_share_override` fachlich die richtige Modellierung?

---

## 10. Konkrete Fragen fuer das Gespraech mit dem Steuerberater

Die folgenden Punkte waeren aus meiner Sicht die wertvollsten Review-Themen:

1. **Kategoriemapping**
   - Welche Kostenarten muessen zwingend anders gruppiert werden?
   - Welche Kategorien sollten fachlich zusammengelegt oder getrennt werden?

2. **Vermietungsquote**
   - Fuer welche Felder ist die aktuelle Quotelogik korrekt?
   - Fuer welche Felder braucht es Ausnahmen?

3. **AfA-Modell**
   - Welche Quelle sollte fuehrend sein:
     - Stammwert
     - Jahreswert
     - importierter ELSTER-Wert
     - strukturierte AfA-Komponente

4. **Erhaltungsaufwand**
   - Wann sofort abzugsfaehig?
   - Wann verteilt?
   - Wann anschaffungsnahe Herstellungskosten?
   - Welche Positionen muessen explizit ausgeschlossen werden?

5. **GbR-/FE-FB-Modell**
   - Sind die Partnerzuordnungen und Sonderwerbungskosten in der aktuellen Form fachlich sauber?

6. **PDF-Import**
   - Welche Felder duerfen automatisiert uebernommen werden?
   - Welche muessen als Vorschlag oder Pruefhinweis behandelt werden?

7. **ELSTER-Buckets**
   - Entsprechen die verdichteten Buckets der gewuenschten fachlichen Sicht?
   - Welche Bloecke sollten fuer Beratung und Erklaerung anders strukturiert werden?

---

## 11. Empfohlener Besprechungsablauf

Fuer ein effizientes Gespraech mit dem Steuerberater wuerde ich so vorgehen:

1. Einen echten Beispiel-Fall aufrufen
2. Rohdaten zeigen:
   - Transaktionen
   - Kategorien
   - Objektstammdaten
   - Verteilungsbloecke
   - AfA-Komponenten
3. Danach das Ergebnis zeigen:
   - Anlage V
   - ELSTER-Buckets
   - ggf. FE/FB
4. Fuer jede groessere Summe fragen:
   - ist die Zuordnung fachlich richtig?
   - ist die Quotelung richtig?
   - ist die Einordnung sofort/verteilt/AfA richtig?
5. Am Ende eine Liste von Regelanpassungen ableiten:
   - Mapping-Regeln
   - Quotelungsregeln
   - Importregeln
   - Pflichtpruefungen

---

## 12. Technischer Anhang

Zentrale Dateien:

- Transaktionsberechnung:
  [lib/tax/calculateTaxFromTransactions.ts](/Users/leotacke/Documents/Privat/Immohub/myimmohub/lib/tax/calculateTaxFromTransactions.ts)
- Strukturierte Logik:
  [lib/tax/structuredTaxLogic.ts](/Users/leotacke/Documents/Privat/Immohub/myimmohub/lib/tax/structuredTaxLogic.ts)
- ELSTER-/Bucket-Aufbereitung:
  [lib/tax/elsterLineLogic.ts](/Users/leotacke/Documents/Privat/Immohub/myimmohub/lib/tax/elsterLineLogic.ts)
- GbR-/FE-FB-Bericht:
  [lib/tax/gbrTaxReport.ts](/Users/leotacke/Documents/Privat/Immohub/myimmohub/lib/tax/gbrTaxReport.ts)
- Berechnungs-API:
  [app/api/tax/calculate/route.ts](/Users/leotacke/Documents/Privat/Immohub/myimmohub/app/api/tax/calculate/route.ts)
- PDF-Import:
  [app/api/tax/import/route.ts](/Users/leotacke/Documents/Privat/Immohub/myimmohub/app/api/tax/import/route.ts)
- Logik-Items-API:
  [app/api/tax/logic-items/route.ts](/Users/leotacke/Documents/Privat/Immohub/myimmohub/app/api/tax/logic-items/route.ts)
- Felddefinitionen:
  [lib/tax/fieldMeta.ts](/Users/leotacke/Documents/Privat/Immohub/myimmohub/lib/tax/fieldMeta.ts)

---

## 13. Kurzfazit

Die Tax Engine ist heute bereits mehr als ein einfacher Feldrechner. Sie ist faktisch ein mehrstufiges Regelwerk aus:

- Transaktionsmapping
- Vermietungsquotelung
- strukturierter AfA-Logik
- Verteilungslogik fuer Erhaltungsaufwand
- ELSTER-Bucket-Verdichtung
- GbR-/Partnerallokation
- PDF-Importharmonisierung

Genau deshalb lohnt sich das Review mit einem Steuerberater besonders: Der groesste Mehrwert liegt wahrscheinlich nicht in Einzelbugs, sondern in der fachlichen Scharfstellung der Regeln.
