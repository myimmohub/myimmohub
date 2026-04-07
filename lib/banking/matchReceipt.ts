export type ReceiptCandidate = {
  extracted_amount: number | null;
  extracted_date: string | null;
  extracted_counterpart: string | null;
};

export type TransactionRow = {
  id: string;
  amount: number;
  date: string;
  counterpart: string | null;
};

export type MatchResult = { transactionId: string; score: number } | null;

// Legal suffix tokens to strip when normalising company names
const LEGAL_SUFFIX_RE =
  /\b(gmbh|ag|kg|ohg|gbr|ug|e\.?v\.?|inc|ltd|llc|co\.?)\b\.?/gi;

function normalise(s: string): string {
  return s.toLowerCase().replace(LEGAL_SUFFIX_RE, "").replace(/\s+/g, " ").trim();
}

function counterpartScore(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const na = normalise(a);
  const nb = normalise(b);
  if (!na || !nb) return 0;

  // Substring containment
  if (na.includes(nb) || nb.includes(na)) return 0.2;

  // Word-overlap ≥ 60 %
  const wordsA = new Set(na.split(" ").filter(Boolean));
  const wordsB = new Set(nb.split(" ").filter(Boolean));
  const total = Math.max(wordsA.size, wordsB.size);
  if (total === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) if (wordsB.has(w)) overlap++;
  if (overlap / total >= 0.6) return 0.2;

  return 0;
}

function dateDiffDays(a: string, b: string): number {
  const msPerDay = 86_400_000;
  return Math.round(Math.abs(new Date(a).getTime() - new Date(b).getTime()) / msPerDay);
}

function dateScore(receiptDate: string | null, txDate: string): number {
  if (!receiptDate) return 0;
  const diff = dateDiffDays(receiptDate, txDate);
  if (diff === 0) return 0.3;
  if (diff === 1) return 0.2;
  if (diff === 2) return 0.1;
  if (diff === 3) return 0.05;
  return 0;
}

export function matchReceipt(
  receipt: ReceiptCandidate,
  candidates: TransactionRow[],
): MatchResult {
  let best: { transactionId: string; score: number } | null = null;

  for (const tx of candidates) {
    let score = 0;

    // Amount match (±0.01)
    if (
      receipt.extracted_amount !== null &&
      Math.abs(Math.abs(receipt.extracted_amount) - Math.abs(tx.amount)) <= 0.01
    ) {
      score += 0.5;
    }

    // Date match (sliding scale up to 3 days)
    score += dateScore(receipt.extracted_date, tx.date);

    // Counterpart similarity
    score += counterpartScore(receipt.extracted_counterpart, tx.counterpart);

    if (score >= 0.7 && (!best || score > best.score)) {
      best = { transactionId: tx.id, score };
    }
  }

  return best;
}
