// Sign-in and verification codes are never stored or sent to the model. A message
// that *contains* such a code is dropped on arrival. Warnings like "we'll never ask
// for your OTP" (no code present) and promo codes ("use code SAVE20") are kept.

const PATTERNS: RegExp[] = [
  // "Your OTP is 482913", "verification code: 1234", "one-time passcode 55 21 90"
  /\b(?:otp|one[- ]time (?:password|passcode|code|pin)|(?:verification|security|login|log-in|sign[- ]in|authentication|authorization|access|2fa|2-step) (?:code|pin|number))\b[^\d\n]{0,30}\b\d(?:[ -]?\d){3,7}\b/i,
  // "482913 is your Uber code", "123456 is your verification code"
  /\b\d{4,8}\b[^\n]{0,40}\bis (?:your|the)\b[^\n]{0,30}\b(?:code|otp|pin|password|passcode)\b/i,
  // "Your OTP for the purchase of TT$144.51 at UBER is 482913"
  /\b(?:otp|verification code|one[- ]time (?:password|passcode|code|pin))\b[^\n]{0,80}\bis:?\s*\d{4,8}\b/i,
  // "Your code is 123456", "Your Apple ID code is: 123456"
  /\byour (?:[\w-]+ ){0,3}code is:?\s*\d{4,8}\b/i,
  // "G-123456 is your Google verification code"
  /\bG-\d{5,8}\b/,
];

export function containsSecurityCode(text: string | null | undefined): boolean {
  if (!text) return false;
  return PATTERNS.some((re) => re.test(text));
}
