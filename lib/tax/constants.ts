/**
 * Zentrale fachliche Konstanten der Tax-Engine.
 *
 * Diese Werte sind in mehreren Modulen referenziert (`pipeline.ts`,
 * `calculateTaxFromTransactions.ts`, `structuredTaxLogic.ts`). Vor dem
 * Marktreife-Pass waren sie als Magic-Numbers im Code verstreut. Hier
 * mit fachlicher Quelle dokumentiert.
 *
 * Achtung: Änderungen hier verändern den Output der Goldstandard-Tests.
 * Diese müssen zwingend mit aktualisiert werden.
 */

/**
 * Pauschale Verwaltungskosten für FeWo / Privatvermietung.
 *
 * Quelle: ELSTER Anlage V (Zeile 78 "Nicht umlegbare Kosten" /
 *         Verwaltung), branchenübliche Pauschale für Privatvermieter.
 *         FG Köln Urteil 2008 hat 240 €/Jahr als angemessen anerkannt.
 *
 * Anwendung: Wenn KEINE Verwaltungs-Transaktion gefunden wird, wird
 *            dieser Pauschalwert ins Property-Management-Bucket gebucht
 *            und mit der Vermietungsquote pro-ratiert.
 */
export const VERWALTUNGSPAUSCHALE_EUR = 240;

/**
 * Porto-Pauschale für FeWo / Privatvermietung.
 *
 * Quelle: ELSTER Anlage V (Zeile 78), branchenübliche Pauschale für
 *         Schreibwerk, Briefe, Postversand an Mieter / Steuerberater.
 *
 * Anwendung: identisch zur Verwaltungspauschale.
 */
export const PORTO_PAUSCHALE_EUR = 17;

/**
 * Schwellenwert für anschaffungsnahe Aufwendungen nach § 6 Abs. 1 Nr. 1a EStG.
 *
 * Quelle: § 6 Abs. 1 Nr. 1a EStG ("anschaffungsnahe Herstellungskosten"):
 *         Innerhalb von 3 Jahren nach Anschaffung dürfen Erhaltungs-
 *         aufwendungen 15 % der Anschaffungskosten des Gebäudes nicht
 *         übersteigen, sonst werden sie zu Herstellungskosten umqualifiziert
 *         (→ aktiviert + AfA, statt Sofortabzug).
 */
export const ANSCHAFFUNGSNAHE_AUFWAND_QUOTE = 0.15; // 15 %

/**
 * Standard-Verteilungsdauer für Erhaltungsaufwendungen nach § 11a / 11b EStG /
 * § 82b EStDV (größerer Erhaltungsaufwand auf bis zu 2–5 Jahre verteilbar).
 *
 * Quelle: § 82b EStDV. Gewählt wird üblicherweise der maximale Zeitraum
 *         (5 Jahre) für maximale Steuerstreckung.
 */
export const ERHALTUNG_VERTEILUNGSJAHRE_MAX = 5;

/**
 * Restnutzungsdauer für Inventar / GWG / bewegliche Wirtschaftsgüter.
 *
 * Quelle: AfA-Tabelle für allgemeine Wirtschaftsgüter (BMF), Kategorie
 *         "Einbauküche / Einrichtung Ferienwohnung": 10 Jahre Nutzungsdauer
 *         (= 10 % linear AfA p.a.).
 */
export const INVENTAR_RESTNUTZUNG_JAHRE = 10;

/**
 * Default AfA-Satz Gebäude in % (5,56 %).
 *
 * Quelle: § 7 Abs. 4 Nr. 2 EStG - Sonderabschreibung "Wohnungsbau" oder
 *         degressive AfA für Spezialfälle. Bei der Kesslerberg GbR (Ferien-
 *         wohnung Hinterzarten) ist 5,56 % der historisch verwendete Satz.
 *         Standardfälle nutzen 2,0 % (Baujahr ≤ 2022) bzw. 3,0 % (≥ 2023).
 *         Sieh `lib/calculateAfA.ts` für die normale Lookup-Logik.
 */
export const DEFAULT_AFA_SATZ_PCT = 5.56;
