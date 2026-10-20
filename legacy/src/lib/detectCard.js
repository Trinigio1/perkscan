// src/lib/detectCard.js
import { CARD_PRODUCTS } from "../data/cardCatalog";

function normalize(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreMatch(queryNorm, candidateNorm) {
  // Token overlap score (simple + robust)
  const qTokens = new Set(queryNorm.split(" ").filter(Boolean));
  const cTokens = new Set(candidateNorm.split(" ").filter(Boolean));
  if (qTokens.size === 0 || cTokens.size === 0) return 0;

  let overlap = 0;
  qTokens.forEach((t) => {
    if (cTokens.has(t)) overlap += 1;
  });

  return overlap / Math.max(qTokens.size, cTokens.size);
}

export function detectCardFromQuery(query) {
  const q = normalize(query);

  let best = null;
  let bestScore = 0;

  const scored = CARD_PRODUCTS.map((p) => {
    const candidates = [p.displayName, ...(p.aliases || [])].map(normalize);
    const s = Math.max(...candidates.map((c) => scoreMatch(q, c)));
    return { p, score: s };
  }).sort((a, b) => b.score - a.score);

  if (scored.length) {
    best = scored[0].p;
    bestScore = scored[0].score;
  }

  // build suggestions
  const topSuggestions = scored.slice(0, 4).map(({ p, score }) => ({
    productId: p.productId,
    displayName: p.displayName,
    issuer: p.issuer,
    confidence: Number(score.toFixed(2)),
  }));

  // thresholds
  const confidence = Number(bestScore.toFixed(2));
  const needsConfirmation = confidence < 0.8;

  if (!best || confidence < 0.35) {
    // too weak = "not found"
    return {
      productId: "",
      productName: "",
      issuer: "",
      confidence,
      needsConfirmation: true,
      matchedOn: "no_match",
      topSuggestions,
    };
  }

  return {
    productId: best.productId,
    productName: best.displayName,
    issuer: best.issuer,
    confidence,
    needsConfirmation,
    matchedOn: "name/alias",
    topSuggestions,
  };
}
