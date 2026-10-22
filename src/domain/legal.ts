// DRAFT privacy policy and terms, written to match what PerkScan actually does.
// Placeholders in [brackets]. Have a lawyer review both before any public launch.

export interface LegalDoc {
  title: string;
  updated: string;
  sections: { heading: string; body: string[] }[];
}

const UPDATED = 'Draft — October 2026';

export const PRIVACY: LegalDoc = {
  title: 'Privacy policy',
  updated: UPDATED,
  sections: [
    {
      heading: 'What PerkScan does',
      body: [
        'PerkScan helps you notice money you may be owed: card credits, card protections, promo codes, gift cards, store credit, trials, return windows, student offers and class-action settlements. It informs and guides; it never files claims or acts for you.',
      ],
    },
    {
      heading: 'What we collect',
      body: [
        'Account: your email address (for sign-in), country, home currency, time zone, and — if you choose — that you’re a student and your school.',
        'Cards: the card product (e.g. “Scotiabank Visa Classic”) and its last 4 digits, plus an optional open date and nickname. Never a full card number, expiry date or security code.',
        'Emails and texts you send PerkScan (only ones you label, forward, share or paste): card numbers are masked before anything is stored, messages containing sign-in or verification codes are discarded on arrival, and the remaining text is deleted as soon as it has been read — within 24 hours at most. We keep only what was extracted: store, amounts and currency, dates, codes, a short summary, the card’s last 4 digits, and the sender’s domain (not the address).',
        'Things you do in the app: credits and offers you mark as used, reviews of what PerkScan read, perks you add, and student offers you mark as claimed.',
        'Usage statistics (only if enabled in this version): which features are used, sent with a random install id — never your account, emails, stores, cards or amounts. You can turn this off in Settings.',
      ],
    },
    {
      heading: 'Who processes it',
      body: [
        'Supabase hosts our database and sign-in. Anthropic’s Claude API reads the cleaned text of emails and texts you send so PerkScan can pick out offers and purchases. PostHog receives anonymous usage statistics if enabled. [List any other processors and their regions.]',
        'We never sell or share your data with advertisers or data brokers.',
      ],
    },
    {
      heading: 'Your choices',
      body: [
        'Settings → Export or delete my data: download everything we keep about you, or permanently delete your account and all of it at once.',
        'Settings → Connected sources: revoke any Gmail or texts connection instantly.',
      ],
    },
    {
      heading: 'Security',
      body: [
        'Each person can only read their own data (database row-level security). Connection tokens are stored only as a one-way fingerprint. Data is encrypted in transit.',
      ],
    },
    {
      heading: 'Children',
      body: ['PerkScan isn’t meant for children under 13. [Confirm the minimum age for your markets.]'],
    },
    {
      heading: 'Contact',
      body: ['[Company name, address and privacy contact email.]'],
    },
  ],
};

export const TERMS: LegalDoc = {
  title: 'Terms of use',
  updated: UPDATED,
  sections: [
    {
      heading: 'Information, not advice',
      body: [
        'PerkScan gives general information to help you notice benefits and offers. It is not financial, legal or tax advice, and it never files claims, contacts merchants or acts on your behalf.',
      ],
    },
    {
      heading: 'Accuracy',
      body: [
        'Card benefits, offers, student perks and settlements change. Items marked “not verified” haven’t been checked against an official source. PerkScan reads emails and texts automatically and can make mistakes. Always confirm terms with your card issuer, the merchant, the provider or the official settlement site before relying on them.',
      ],
    },
    {
      heading: 'Your account',
      body: [
        'Keep your sign-in email and connection tokens private. Only send PerkScan messages you’re allowed to share. Don’t misuse the service or try to access other people’s data.',
      ],
    },
    {
      heading: 'Third parties',
      body: ['Offers, perks and claims come from other companies on their own terms. PerkScan isn’t affiliated with them unless it says so.'],
    },
    {
      heading: 'Liability and changes',
      body: ['[Limitation of liability, governing law and dispute terms — to be written with a lawyer.] We may update these terms and will tell you in the app when we do.'],
    },
  ],
};
