/**
 * buildArrearsPayload (pure Function).
 *
 * Generiert {recipient_email, subject, body_text, body_html} für Mahnung-
 * E-Mails je Eskalationsstufe.
 *
 * Töne:
 *   Level 0 (Erinnerung)     → höflich, neutral, "Erinnerung"
 *   Level 1 (1. Mahnung)     → formaler, klar, "Mahnung"
 *   Level 2 (2. Mahnung)     → juristisch sachlicher Hinweis auf
 *                               §543 Abs. 2 Nr. 3 BGB (außerordentliche
 *                               Kündigung bei Zahlungsverzug)
 *   Level 3 (Letztmalig)     → "letzte" Mahnung, Hinweis auf rechtliche
 *                               Konsequenzen / mögliche Räumungsklage. KEIN
 *                               konkretes Räumungs-Angebot — nur Hinweis.
 *
 * Pure: keine Side-Effects, kein Date.now, kein I/O.
 */

export type ArrearsPayloadLevel = 0 | 1 | 2 | 3;

export type ArrearsPayloadInput = {
  property: { name: string; address: string | null };
  tenant: { first_name: string | null; last_name: string; email: string };
  unit: { label: string };
  arrear: {
    arrear_month: string; // yyyy-mm
    amount_cents: number;
  };
  level: ArrearsPayloadLevel;
};

export type ArrearsPayload = {
  recipient_email: string;
  subject: string;
  body_text: string;
  body_html: string;
};

function fmtCentsDe(cents: number): string {
  const eur = cents / 100;
  return eur.toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtMonthDe(month: string): string {
  // yyyy-mm → "MM/yyyy"
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return month;
  return `${m[2]}/${m[1]}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function tenantSalutation(t: ArrearsPayloadInput["tenant"]): string {
  const first = (t.first_name ?? "").trim();
  const last = t.last_name.trim();
  if (first && last) return `Sehr geehrte/r ${first} ${last},`;
  if (last) return `Sehr geehrte/r ${last},`;
  return "Sehr geehrte/r Mieter/in,";
}

function levelLabel(level: ArrearsPayloadLevel): string {
  switch (level) {
    case 0:
      return "Zahlungserinnerung";
    case 1:
      return "1. Mahnung";
    case 2:
      return "2. Mahnung";
    case 3:
      return "Letztmalige Mahnung";
  }
}

function bodyTextForLevel(
  level: ArrearsPayloadLevel,
  monthDe: string,
  amountStr: string,
  unitLabel: string,
  propertyAddr: string,
): string[] {
  const where = `Wohneinheit "${unitLabel}"${propertyAddr ? `, ${propertyAddr}` : ""}`;
  switch (level) {
    case 0:
      return [
        `bei einer Routine-Prüfung Ihres Mietkontos haben wir festgestellt, dass für den Zeitraum ${monthDe} (${where}) ein offener Betrag in Höhe von ${amountStr} verbucht ist.`,
        ``,
        `Wir gehen davon aus, dass es sich um ein Versehen handelt, und bitten Sie freundlich, den Betrag zeitnah auszugleichen. Sollten Sie die Zahlung bereits veranlasst haben, betrachten Sie diese E-Mail bitte als gegenstandslos.`,
        ``,
        `Bei Rückfragen stehen wir Ihnen gerne zur Verfügung.`,
      ];
    case 1:
      return [
        `trotz unserer Erinnerung ist die Mietzahlung für ${monthDe} (${where}) bislang nicht vollständig auf unserem Konto eingegangen. Es besteht weiterhin ein offener Betrag von ${amountStr}.`,
        ``,
        `Wir bitten Sie hiermit verbindlich, den ausstehenden Betrag unverzüglich, spätestens innerhalb der gesetzlich üblichen Frist, zu begleichen.`,
        ``,
        `Falls Sie die Zahlung bereits angewiesen haben, ist diese Mahnung gegenstandslos.`,
      ];
    case 2:
      return [
        `wir müssen Sie erneut auf den offenen Mietbetrag in Höhe von ${amountStr} für ${monthDe} (${where}) hinweisen. Trotz mehrfacher Aufforderung ist bisher keine Zahlung eingegangen.`,
        ``,
        `Wir weisen vorsorglich darauf hin, dass nach § 543 Abs. 2 Nr. 3 BGB eine außerordentliche fristlose Kündigung des Mietverhältnisses möglich ist, wenn der Mieter mit der Entrichtung der Miete an zwei aufeinanderfolgenden Terminen mit einem nicht unerheblichen Teil oder über einen längeren Zeitraum mit einem Betrag in Höhe von zwei Monatsmieten in Verzug kommt.`,
        ``,
        `Wir setzen Ihnen daher eine Nachfrist und bitten dringend um Begleichung des offenen Betrags.`,
      ];
    case 3:
      return [
        `nach mehreren erfolglosen Mahnungen ist der ausstehende Mietbetrag in Höhe von ${amountStr} für ${monthDe} (${where}) weiterhin nicht beglichen.`,
        ``,
        `Diese Mahnung ergeht letztmalig. Sollte der offene Betrag nicht innerhalb der nächsten 7 Tage vollständig auf unserem Konto eingegangen sein, sehen wir uns gezwungen, weitere rechtliche Schritte einzuleiten. Dies kann insbesondere die außerordentliche Kündigung des Mietverhältnisses gemäß § 543 Abs. 2 Nr. 3 BGB sowie die gerichtliche Geltendmachung der Forderung zur Folge haben.`,
        ``,
        `Wir möchten ein solches Vorgehen vermeiden und bitten Sie eindringlich, den offenen Betrag umgehend auszugleichen oder unverzüglich Kontakt mit uns aufzunehmen.`,
      ];
  }
}

export function buildArrearsPayload(
  input: ArrearsPayloadInput,
): ArrearsPayload {
  const monthDe = fmtMonthDe(input.arrear.arrear_month);
  const amountStr = fmtCentsDe(input.arrear.amount_cents);
  const propertyAddr = (input.property.address ?? "").trim();
  const unitLabel = input.unit.label.trim();
  const label = levelLabel(input.level);

  const subject = `${label} · ${monthDe} · ${input.property.name}${unitLabel ? `, ${unitLabel}` : ""}`;

  const salutation = tenantSalutation(input.tenant);

  const bodyParas = bodyTextForLevel(
    input.level,
    monthDe,
    amountStr,
    unitLabel,
    propertyAddr,
  );

  const lines: string[] = [];
  lines.push(salutation);
  lines.push("");
  for (const p of bodyParas) lines.push(p);
  lines.push("");
  lines.push("Mit freundlichen Grüßen");
  lines.push(input.property.name);

  const body_text = lines.join("\n");

  const htmlParas = bodyParas
    .filter((p) => p !== "")
    .map((p) => `<p>${escapeHtml(p)}</p>`);

  const body_html = [
    `<p>${escapeHtml(salutation)}</p>`,
    ...htmlParas,
    `<p>Mit freundlichen Grüßen<br/>${escapeHtml(input.property.name)}</p>`,
  ].join("\n");

  return {
    recipient_email: input.tenant.email,
    subject,
    body_text,
    body_html,
  };
}
