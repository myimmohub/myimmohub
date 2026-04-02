export type AfAResult = {
  satz: number; // z.B. 0.02 für 2%
  jahresbetrag: number; // in Euro
};

export function calculateAfA(baujahr: number, kaufpreis: number): AfAResult {
  let satz: number;

  if (baujahr < 1925) {
    satz = 0.025;
  } else if (baujahr <= 2022) {
    satz = 0.02;
  } else {
    satz = 0.03;
  }

  return { satz, jahresbetrag: kaufpreis * satz };
}
