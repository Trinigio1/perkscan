import { Note } from './ui';

export const DISCLAIMER_SHORT =
  'PerkScan informs and guides. It does not file claims, contact merchants, or give financial or legal advice. Always confirm terms with your card issuer.';

export const DISCLAIMER_FULL = [
  'PerkScan helps you notice benefits and money you may be owed. It informs and guides; it does not file claims, contact merchants or card issuers, or act on your behalf.',
  'Nothing in PerkScan is financial, legal, tax, or insurance advice. Benefit amounts, coverage, and deadlines come from a catalog we maintain by hand and can be out of date. Amounts marked "not verified" are excluded from totals.',
  'Always confirm the current terms, eligibility, and deadlines with your card issuer or the merchant before you rely on them.',
];

export function Disclaimer({ text = DISCLAIMER_SHORT }: { text?: string }) {
  return <Note icon="information-circle-outline">{text}</Note>;
}
