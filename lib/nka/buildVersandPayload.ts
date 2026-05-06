/**
 * Pure Funktion zum Aufbau der Versand-Texte für die NKA-Mailout.
 *
 * Output: Empfänger-Adresse, Subject, Plain-Text-Body, einfacher HTML-Body.
 * Keine Side-Effects, kein Date.now, kein I/O — gut testbar / deterministisch.
 *
 * Wird von der API-Route `/api/nka/periods/[id]/versand` aufgerufen, der die
 * Persistenz und den eigentlichen Resend-Call übernimmt.
 */

// ─── Helpers (DE-Format) ─────────────────────────────────────────────────────

function fmtCentsDe(cents: number): string {
  const eur = cents / 100;
  return eur.toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtIsoDateDe(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type VersandPayloadInput = {
  property: { name: string; address: string | null };
  period: { period_start: string; period_end: string };
  tenant: { first_name: string | null; last_name: string; email: string };
  unit: { label: string };
  share: {
    total_share_cents: number;
    total_paid_advance_cents: number;
    balance_cents: number;
  };
};

export type VersandPayload = {
  recipient_email: string;
  subject: string;
  body_text: string;
  body_html: string;
};

/**
 * Saldo-Logik: balance_cents = total_paid_advance - total_share.
 *   - balance < 0 → Mieter muss nachzahlen (Nachzahlung).
 *   - balance > 0 → Mieter erhält Guthaben.
 *   - balance = 0 → Ausgeglichen.
 */
function deriveSaldoText(balanceCents: number): {
  label: string;
  amount_str: string;
  sentence: string;
} {
  if (balanceCents < 0) {
    const abs = Math.abs(balanceCents);
    return {
      label: "Nachzahlung",
      amount_str: fmtCentsDe(abs),
      sentence: `Aus der Abrechnung ergibt sich eine Nachzahlung in Höhe von ${fmtCentsDe(abs)}.`,
    };
  }
  if (balanceCents > 0) {
    return {
      label: "Guthaben",
      amount_str: fmtCentsDe(balanceCents),
      sentence: `Aus der Abrechnung ergibt sich ein Guthaben in Höhe von ${fmtCentsDe(balanceCents)} zu Ihren Gunsten.`,
    };
  }
  return {
    label: "Ausgeglichen",
    amount_str: fmtCentsDe(0),
    sentence: "Aus der Abrechnung ergibt sich weder eine Nachzahlung noch ein Guthaben — der Saldo ist ausgeglichen.",
  };
}

function tenantSalutation(t: VersandPayloadInput["tenant"]): string {
  const first = (t.first_name ?? "").trim();
  const last = t.last_name.trim();
  if (first && last) return `Sehr geehrte/r ${first} ${last},`;
  if (last) return `Sehr geehrte/r ${last},`;
  return "Sehr geehrte/r Mieter/in,";
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function buildVersandPayload(input: VersandPayloadInput): VersandPayload {
  const periodStart = fmtIsoDateDe(input.period.period_start);
  const periodEnd = fmtIsoDateDe(input.period.period_end);
  const saldo = deriveSaldoText(input.share.balance_cents);

  const propertyAddress = (input.property.address ?? "").trim();
  const unitLabel = input.unit.label.trim();

  const subject =
    `Nebenkostenabrechnung ${periodStart}–${periodEnd} · ` +
    `${input.property.name}${unitLabel ? `, ${unitLabel}` : ""}`;

  const salutation = tenantSalutation(input.tenant);

  const lines: string[] = [];
  lines.push(salutation);
  lines.push("");
  lines.push(
    `anbei erhalten Sie die Nebenkostenabrechnung für den Zeitraum ${periodStart} bis ${periodEnd} ` +
      `für die Wohneinheit "${unitLabel}"${propertyAddress ? `, ${propertyAddress}` : ""}.`,
  );
  lines.push("");
  lines.push(
    `Gesamte Kosten: ${fmtCentsDe(input.share.total_share_cents)}  ·  ` +
      `Vorauszahlungen: ${fmtCentsDe(input.share.total_paid_advance_cents)}  ·  ` +
      `Saldo: ${saldo.label} ${saldo.amount_str}`,
  );
  lines.push("");
  lines.push(saldo.sentence);
  lines.push("");
  lines.push("Die ausführliche Abrechnung mit allen Einzelpositionen finden Sie im PDF-Anhang dieser E-Mail.");
  lines.push("");
  lines.push(
    "Hinweis: Sie haben gemäß § 556 Abs. 3 BGB zwölf Monate nach Zugang dieser Abrechnung Zeit, " +
      "schriftlich Einwendungen geltend zu machen. Auf Wunsch können Sie nach Terminabsprache Einsicht " +
      "in die zugrunde liegenden Belege nehmen.",
  );
  lines.push("");
  lines.push("Mit freundlichen Grüßen");
  lines.push(input.property.name);

  const body_text = lines.join("\n");

  // Einfache HTML-Variante: gleiche Inhalte, mit <p>-Absätzen und kleinem Stil.
  const htmlParagraphs = [
    `<p>${escapeHtml(salutation)}</p>`,
    `<p>anbei erhalten Sie die Nebenkostenabrechnung für den Zeitraum <strong>${escapeHtml(periodStart)} bis ${escapeHtml(periodEnd)}</strong> für die Wohneinheit „${escapeHtml(unitLabel)}"${propertyAddress ? `, ${escapeHtml(propertyAddress)}` : ""}.</p>`,
    `<p><strong>Gesamte Kosten:</strong> ${escapeHtml(fmtCentsDe(input.share.total_share_cents))}<br/>` +
      `<strong>Vorauszahlungen:</strong> ${escapeHtml(fmtCentsDe(input.share.total_paid_advance_cents))}<br/>` +
      `<strong>Saldo:</strong> ${escapeHtml(saldo.label)} ${escapeHtml(saldo.amount_str)}</p>`,
    `<p>${escapeHtml(saldo.sentence)}</p>`,
    `<p>Die ausführliche Abrechnung mit allen Einzelpositionen finden Sie im PDF-Anhang dieser E-Mail.</p>`,
    `<p style="font-size:0.9em;color:#555">Hinweis: Sie haben gemäß § 556 Abs. 3 BGB zwölf Monate nach Zugang dieser Abrechnung Zeit, schriftlich Einwendungen geltend zu machen. Auf Wunsch können Sie nach Terminabsprache Einsicht in die zugrunde liegenden Belege nehmen.</p>`,
    `<p>Mit freundlichen Grüßen<br/>${escapeHtml(input.property.name)}</p>`,
  ];

  const body_html = htmlParagraphs.join("\n");

  return {
    recipient_email: input.tenant.email,
    subject,
    body_text,
    body_html,
  };
}
