export interface SpekulationssteuerInput {
  kaufdatum: string; // ISO date string "YYYY-MM-DD"
  verkaufsdatum: string; // ISO date string "YYYY-MM-DD"
  kaufpreis: number;
  verkaufspreis: number;
  /** Persönlicher Steuersatz in Prozent */
  steuersatzPct: number;
  /** Eigennutzung in den letzten 2 Kalenderjahren vor Verkauf */
  selbstgenutzt: boolean;
}

export type SpekulationsStatus =
  | "steuerfrei_10j"
  | "steuerfrei_selbstnutzung"
  | "steuerpflichtig";

export interface SpekulationssteuerResult {
  status: SpekulationsStatus;
  halteJahre: number;
  halteMonate: number;
  steuerfreiAb: Date;
  gewinn: number;
  steuer: number;
  nettogewinn: number;
  ersparnis: number; // Steuer, die man spart wenn man bis Steuerfreiheit wartet
}

export function calcSpekulationssteuer(
  input: SpekulationssteuerInput,
): SpekulationssteuerResult | null {
  const { kaufdatum, verkaufsdatum, kaufpreis, verkaufspreis, steuersatzPct, selbstgenutzt } = input;
  if (!kaufdatum || !verkaufsdatum) return null;

  const kauf = new Date(kaufdatum);
  const verkauf = new Date(verkaufsdatum);
  if (isNaN(kauf.getTime()) || isNaN(verkauf.getTime())) return null;
  if (verkauf <= kauf) return null;

  const diffMs = verkauf.getTime() - kauf.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  const halteJahre = Math.floor(diffDays / 365.25);
  const halteMonate = Math.floor((diffDays % 365.25) / 30.44);

  // Steuerfreies Datum = Kaufdatum + 10 Jahre
  const steuerfreiAb = new Date(kauf);
  steuerfreiAb.setFullYear(steuerfreiAb.getFullYear() + 10);

  const zehnjahreUm = verkauf >= steuerfreiAb;

  let status: SpekulationsStatus;
  if (zehnjahreUm) {
    status = "steuerfrei_10j";
  } else if (selbstgenutzt) {
    status = "steuerfrei_selbstnutzung";
  } else {
    status = "steuerpflichtig";
  }

  const gewinn = verkaufspreis - kaufpreis;
  const steuer =
    status === "steuerpflichtig" && gewinn > 0 ? (gewinn * steuersatzPct) / 100 : 0;
  const nettogewinn = gewinn - steuer;
  // Ersparnis = Steuer, die man durch Warten bis zur Steuerfreiheit vermeiden würde.
  // Wenn bereits steuerpflichtig, entspricht das exakt der aktuellen Steuer.
  const ersparnis = steuer;

  return { status, halteJahre, halteMonate, steuerfreiAb, gewinn, steuer, nettogewinn, ersparnis };
}
