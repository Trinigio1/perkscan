export type DetectedPerk = {
  title: string;
  provider: string;
  cardHint?: string | null;
  validTo?: string | null; // ISO date if detected
  evidence: {
    messageId: string;
    subject: string;
    from: string;
    date: string;
  };
};

const RULES: Array<{
  id: string;
  match: (text: string) => boolean;
  build: (ctx: { messageId: string; subject: string; from: string; date: string }) => DetectedPerk;
}> = [
  {
    id: "amex-uber",
    match: (t) =>
      /uber/i.test(t) &&
      /(american express|amex)/i.test(t) &&
      /(benefit|credit|enrolled|enrollment|added)/i.test(t),
    build: ({ messageId, subject, from, date }) => ({
      title: "Uber benefit / credit (Amex)",
      provider: "American Express",
      cardHint: "Amex (unknown card)",
      validTo: null,
      evidence: { messageId, subject, from, date },
    }),
  },
  {
    id: "chase-doordash",
    match: (t) =>
      /doordash/i.test(t) &&
      /chase/i.test(t) &&
      /(dashpass|benefit|credit)/i.test(t),
    build: ({ messageId, subject, from, date }) => ({
      title: "DoorDash / DashPass benefit (Chase)",
      provider: "Chase",
      cardHint: "Chase (unknown card)",
      validTo: null,
      evidence: { messageId, subject, from, date },
    }),
  },
];

export function detectPerksFromEmail(params: {
  messageId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  bodyText: string;
}): DetectedPerk[] {
  const text = `${params.subject}\n${params.from}\n${params.snippet}\n${params.bodyText}`.toLowerCase();
  const out: DetectedPerk[] = [];

  for (const rule of RULES) {
    if (rule.match(text)) {
      out.push(rule.build({
        messageId: params.messageId,
        subject: params.subject,
        from: params.from,
        date: params.date,
      }));
    }
  }
  return out;
}
