// Store-name matching shared by the server (Deno) and the app. No imports, so both
// runtimes can load it.

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length >= 3 && !['the', 'inc', 'ltd', 'llc', 'com', 'www', 'store', 'shop'].includes(w));

/** "UBER * EATS" ~ "Uber Eats", "PRICESMART #321" ~ "PriceSmart", "Courts" ~ "COURTS TRINIDAD". */
export function sameMerchant(a: string, b: string): boolean {
  const wa = words(a);
  const wb = words(b);
  if (!wa.length || !wb.length) return false;
  const squash = (w: string[]) => w.join('');
  if (squash(wa).includes(squash(wb)) || squash(wb).includes(squash(wa))) return true;
  return wa.some((x) => wb.some((y) => x === y || (x.length >= 4 && y.length >= 4 && x.slice(0, 4) === y.slice(0, 4))));
}
