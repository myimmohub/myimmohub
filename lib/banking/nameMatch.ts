/**
 * Word-Boundary-Match für Banking-Counterpart vs. Mieter-Nachname.
 *
 * Hintergrund: `app/api/payment-matches/route.ts` matched bisher mit
 *   counterpart.includes(last_name)
 * Das matched fälschlich
 *   counterpart "Müllabfuhr Köln" für lastName "Müll" (zu generisch),
 *   counterpart "Müllerstraße 12" für lastName "Müller" (Compound-Bug),
 *   counterpart "Hans Müller" für lastName "Müll" (Substring in "Müller").
 *
 * Strategie: Beide normalisieren (lowercase, NFD, Akzente weg, Umlaute → Vokal).
 * Dann nur matchen, wenn `lastName` als ganzes Wort in `counterpart`
 * vorkommt — Wortgrenze beidseitig (Anfang/Ende oder Leerzeichen/Satzzeichen).
 */

/**
 * Normalisiert einen String für deutsches Matching:
 *   - lowercase (locale-sensitive)
 *   - NFD-Dekomposition + Akzent-Removal (ä→ä→a, é→é→e, ß→ss)
 *   - Umlaute werden so zu reinen Vokalen
 *   - Nicht-Buchstaben/Ziffern werden zu Spaces (Wortgrenze)
 */
export function normalizeForNameMatch(value: string | null | undefined): string {
  if (value == null) return "";
  return value
    .toLocaleLowerCase("de-DE")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // diakritische Zeichen entfernen
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Matched, wenn `lastName` als ganzes Wort in `counterpart` vorkommt.
 *
 * Beispiele:
 *   - "Hans Müller", "Müller"     → true
 *   - "Müllerstraße 12", "Müller" → false  (Compound)
 *   - "Müllabfuhr", "Müll"        → false  (Compound)
 *   - "Müll", "Müll"              → true   (alleine im Counterpart)
 *   - "Hans Müller", "Müll"       → false  (Müller != Müll)
 *
 * Edge-Case: Sehr kurze Namen (≤ 2 Zeichen wie "Li", "Ng") — hier kein
 * Sonderhandling, der Word-Boundary-Match deckt das ab.
 */
export function counterpartMatchesLastName(
  counterpart: string | null | undefined,
  lastName: string | null | undefined,
): boolean {
  const cp = normalizeForNameMatch(counterpart);
  const ln = normalizeForNameMatch(lastName);
  if (!cp || !ln) return false;

  // Word-Boundary-Regex: erlaubter Anfang/Ende ist Stringanfang/-ende oder
  // Leerzeichen (alle anderen Trennzeichen wurden bereits zu Spaces normalisiert).
  const escaped = ln.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|\\s)${escaped}(\\s|$)`);
  return re.test(cp);
}
