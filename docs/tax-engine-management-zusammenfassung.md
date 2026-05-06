# Tax Engine Zusammenfassung fuer Management und Abstimmung

## Zweck

Diese Kurzfassung erklaert auf einer kompakten Ebene, wie die Tax Engine von MyImmoHub aktuell arbeitet, wo ihre Staerken liegen und an welchen Stellen fachliche Abstimmung mit einem Steuerberater sinnvoll ist.

Sie ist bewusst weniger technisch als das Hauptdokument und eignet sich fuer:

- interne Abstimmung
- Management-Review
- Vorbereitung auf ein Steuerberatergespraech

---

## 1. Was die Engine heute leisten soll

Die Tax Engine soll steuerliche Werte fuer Vermietungsobjekte moeglichst konsistent aus zwei Quellen ableiten:

1. **berechnete Werte aus dem System**
   - kategorisierte Banktransaktionen
   - Objektstammdaten
   - jahresbezogene Einstellungen

2. **importierte Werte aus bestehenden Steuerunterlagen**
   - insbesondere ELSTER-/Steuer-PDFs

Ziel ist, daraus eine nachvollziehbare Herleitung fuer:

- Anlage V
- AfA
- Erhaltungsaufwand
- GbR-/FE-FB-Auswertungen
- spaeter auch steuerliche Reconciliation

---

## 2. Wie die Engine fachlich aufgebaut ist

Die Engine arbeitet in drei Ebenen:

### Ebene A: Rohdaten

Hier liegen die operativen Eingaben:

- Transaktionen
- Kategorien
- Objektstammdaten
- Eigennutzungstage / Vermietungsanteil
- manuelle Steuerwerte
- PDF-Importdaten

### Ebene B: Strukturierte Steuerlogik

Diese Ebene ist die wichtigste fachliche Mitte.

Sie verwaltet insbesondere:

- AfA-Komponenten
- verteilte Erhaltungsaufwaende
- Sonderfaelle wie 15%-Pruefung
- Bereinigung von Duplikaten

Diese Ebene ist wichtig, weil sie die Logik stabiler macht als eine reine Summierung aus Einzeltransaktionen.

### Ebene C: Steuerliche Ausgabe

Aus der strukturierten Logik und den Rohdaten werden anschliessend die finalen Bloecke erzeugt:

- Anlage-V-Felder
- ELSTER-nahe Kostenbloecke
- GbR-/FE-FB-Ergebnis
- Export- und PDF-Werte

---

## 3. Was aktuell schon gut funktioniert

Nach dem bisherigen Ausbau sind insbesondere diese Bereiche relativ weit:

- Eigennutzungsquote und Vermietungsanteil
- Trennung zwischen AfA, laufenden Werbungskosten und verteiltem Erhaltungsaufwand
- Fortfuehrung von mehrjaehrigen Verteilungsbloeken
- PDF-Import als strukturierte Datenquelle
- Zusammenfuehrung von Anlage V und FE/FB auf gemeinsamer Logikbasis

Das ist eine gute Grundlage, weil die Engine nicht nur Einzelwerte speichert, sondern bereits versucht, steuerliche Sachverhalte logisch zu modellieren.

---

## 4. Wo die Engine fachlich sensibel ist

Die wichtigsten sensiblen Bereiche sind:

### 4.1 Mapping von Kosten auf Steuerbloecke

Die Engine muss laufende Kosten in passende Zielbloecke einordnen, z. B.:

- umlagefaehige laufende Kosten
- nicht umlegbare Objektkosten
- sonstige Werbungskosten
- Finanzierung
- Erhaltungsaufwand

Hier gibt es zwangslaeufig Heuristiken, weil die Buchhaltungsrealitaet nicht immer sauber kategorisiert ist.

### 4.2 AfA

Die Engine kennt mehrere AfA-Quellen:

- Objektwerte
- manuelle Jahreswerte
- importierte ELSTER-Werte
- strukturierte AfA-Komponenten

Hier muss fachlich geklaert werden, welcher Wert im Zweifel fuehrend sein soll.

### 4.3 Erhaltungsaufwand

Gerade steuerlich ist die Trennung wichtig zwischen:

- sofort abzugsfaehig
- verteilt ueber mehrere Jahre
- anschaffungsnah / Herstellungskosten

Das ist fachlich einer der wichtigsten Pruefpunkte.

### 4.4 GbR-/FE-FB-Logik

Bei mehreren Beteiligten ist wichtig:

- welcher Gesamtwert kollektiv auf Ebene der Immobilie entsteht
- wie er auf Beteiligte verteilt wird
- wann Sonderwerbungskosten separat behandelt werden

---

## 5. Was ein Steuerberater vor allem pruefen sollte

Ein Steuerberater sollte nicht primaer den Code reviewen, sondern die folgenden fachlichen Entscheidungen bestaetigen oder korrigieren:

1. Welche Kostenarten muessen in welche ELSTER-Bloecke?
2. Welche Felder duerfen mit Vermietungsquote gequotelt werden und welche nicht?
3. Wie soll AfA priorisiert werden:
   - Objektjahreswert
   - Komponentenlogik
   - importierter ELSTER-Wert
4. Wann ist Erhaltungsaufwand sofort abzugsfaehig und wann verteilungspflichtig?
5. Wie soll die 15%-Regel fachlich exakt umgesetzt werden?
6. Welche GbR-/FE-FB-Logik ist fuer die Zielmandate gewuenscht?

---

## 6. Empfohlene Verbesserungsstrategie

Die Weiterentwicklung sollte idealerweise in dieser Reihenfolge stattfinden:

1. **fachliche Zieldefinition mit Steuerberater**
   - Kostenmapping
   - AfA-Prioritaeten
   - Erhaltungsaufwand

2. **Dokumentation der fachlichen Regeln**
   - nicht nur im Code, sondern in expliziten Regeltexten

3. **Golden Cases definieren**
   - echte Referenzfaelle mit offizieller ELSTER-Abgabe
   - Sollwerte pro Steuerblock

4. **Engine auf Referenzfaelle testen**
   - nicht nur Summen
   - sondern auch Blockzuordnungen und Reconciliation

5. **erst danach weitere Automatisierung**
   - z. B. intelligentere Importe, Vorschlaege, OCR, KI-Mapping

---

## 7. Empfehlung fuer das Gespraech mit dem Steuerberater

Sinnvoll ist, nicht mit dem gesamten System zu starten, sondern mit einem konkreten Referenzfall:

1. echte ELSTER-Abgabe
2. erzeugter MyImmoHub-Export
3. dieses Briefing
4. die Fragenliste

Damit kann der Steuerberater gezielt sagen:

- welche Logik fachlich stimmt
- welche Heuristik zu riskant ist
- welche Vereinfachungen vertretbar sind
- und welche Stellen fuer produktiven Einsatz zwingend abgesichert werden muessen

---

## 8. Ergebnis in einem Satz

Die Tax Engine ist heute bereits eine ernsthafte fachliche Grundlage, aber sie braucht fuer den produktionsreifen Einsatz eine klar abgestimmte steuerliche Regelbasis, vor allem bei Kostenmapping, AfA-Prioritaeten und Erhaltungsaufwand.
