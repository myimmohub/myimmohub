let sequence = 0;

export function makeDeterministicId(prefix: string) {
  sequence += 1;
  return `${prefix}_${String(sequence).padStart(4, "0")}`;
}
