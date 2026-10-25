# PerkScan launch audit (October 23, 2026)

This is an engineering and compliance review, not legal advice. Items marked **Lawyer** need a qualified lawyer in each country you launch in.

## Verdict

**Not ready for a public launch yet. Ready for a private beta** (TestFlight, Play closed testing) with people you know, once the beta items below are done.

Nothing in the product is inherently illegal. What's missing is mostly paperwork, store requirements, and a few decisions:

| # | Blocker | Why | Effort |
|---|---|---|---|
| 1 | Finish and publish the privacy policy and terms at public URLs | Both stores require a privacy-policy URL. Three placeholders remain in `src/domain/legal.ts` (processors and regions, minimum age, company and contact). The terms have no liability, governing-law or dispute section. | Lawyer, 1–2 weeks |
| 2 | Decide which countries you launch in | The country list includes Canada and the United Kingdom, which bring PIPEDA (and Quebec's Law 25) and UK GDPR (ICO fee, possibly a UK representative). Jamaica's Data Protection Act requires registering with its Information Commissioner. | Decision: launch US + Trinidad & Tobago first and hide the rest |
| 3 | Sign in with Apple on iOS | The app offers "Continue with Google". Apple's guideline 4.8 then requires an equivalent privacy-friendly login, and Sign in with Apple qualifies. It's built but switched off until you have a paid Apple Developer account. | Small: turn on `EXPO_PUBLIC_ENABLE_APPLE_SIGNIN` |
| 4 | Company and accounts | Store listings, the policy's contact section and Google Play's organisation exemption all assume a legal entity, plus Apple Developer ($99/year) and Google Play ($25 once) accounts. | Business setup |
| 5 | Account-deletion web page | Google Play requires a public web link explaining how to delete an account, not just the in-app button. | Small |
| 6 | Google Play testing rule | New personal developer accounts must run a closed test with at least 12 testers for 14 days before production. Organisation accounts are exempt. | 2 weeks |

## 1. Data protection laws by country

| Country | Law | Status for PerkScan |
|---|---|---|
| **United States** | No general federal privacy law. State laws (e.g. California's CCPA) have revenue or volume thresholds PerkScan won't meet at launch. The FTC Act bans deceptive practices, such as a policy that doesn't match what the app does. | **OK** if the privacy policy matches the code. **Lawyer:** whether the FTC's Safeguards Rule under the Gramm-Leach-Bliley Act applies to an app that reads bank alerts and purchase history. Some personal-finance apps are treated as covered "financial institutions". |
| **Trinidad & Tobago** | Data Protection Act 2011, only partly proclaimed. The private-sector rules (Part IV) are still not in force, as far as public sources show. | **OK today.** Follow its principles anyway (PerkScan already does) so nothing changes when it is proclaimed. |
| **Jamaica** | Data Protection Act 2020, in force since December 1, 2023. Controllers must register with the Office of the Information Commissioner, pay an annual fee and name a responsible person (DPO). | **Not ready.** Register first, or don't offer Jamaica yet. |
| **Barbados** | Data Protection Act 2019, in force since March 31, 2021. Its registration sections weren't brought into force at that time. | **Lawyer** before offering Barbados. |
| **The Bahamas** | Data Protection Act 2003 (in force). | **Lawyer** before offering. |
| **Guyana** | Data Protection Act 2023, passed but apparently not yet in force. | Low risk now; recheck before launch. |
| **Canada** | PIPEDA; Quebec Law 25 is stricter. | **Not ready.** Hide Canada at launch. |
| **United Kingdom** | UK GDPR and the Data Protection Act 2018. ICO fee, and possibly a UK representative. | **Not ready.** Hide the UK at launch. |

**Recommendation:** launch in the United States and Trinidad & Tobago only. Add other countries one at a time, each after its registration or lawyer check.

## 2. What PerkScan does with data, checked against the code

| Rule | Status | Evidence |
|---|---|---|
| Never store full card numbers (issuer, product, last 4 only) | ✅ | `user_cards.last_four` is checked to be exactly 4 digits. Card numbers in emails are masked before storage (`maskCardNumbers`, Luhn-checked). |
| Raw email text deleted after reading, 24 h max | ✅ | Text is deleted right after parsing, plus an hourly purge (`_purge_raw_bodies`). |
| Sign-in and verification codes never stored | ✅ | Messages containing them are dropped on arrival (`security.ts`). |
| Row-level security on every table | ✅ | Verified: no table without RLS. Two service-only tables have no user access by design. |
| Users can only change their own rows | ✅ | Every write policy checks `user_id = auth.uid()`. Profile updates are limited to safe columns. |
| Internal functions not callable from the app | ✅ | All `SECURITY DEFINER` functions set `search_path`. None are runnable by anonymous users, and internal jobs aren't runnable by signed-in users. |
| Secrets only in environment variables | ✅ | No keys in the repository. Only `.env.example` is tracked. |
| Every inbound webhook verified | ✅ | Email/text ingest needs a personal token (format-checked, looked up hashed, revocable). The scout needs a 24+ character secret, compared in constant time. |
| Never sell or share data | ✅ | No ads or tracking SDKs. Nothing one user sends is shown to another. ("Help people nearby find deals" was retired.) Store pages are found only from domains that email 3+ users. |
| Never invent benefit amounts | ✅ | Unverified amounts stay empty and show as "Check". Scouted deals must quote their page. |
| Export and delete my data | ✅ | In the app. Deletion cascades through every user table. |
| No financial or legal advice | ✅ | Disclaimers in onboarding, the terms and offer screens. |

**Third parties that receive data:**
- **Supabase:** database and sign-in.
- **Anthropic:** reads cleaned email and text content.
- **PostHog:** anonymous usage statistics, only if enabled.
- **Google:** the Gmail script runs in each user's own Google account.

**Lawyer:** confirm each processor's terms (data use, retention, region) and list them with their regions in the policy.

## 3. Reading store and bank websites (the scout)

- **What it does:** reads a small number of public promotion pages, about once a day each. It identifies itself (`PerkScanBot`), obeys robots.txt, never logs in and never leaves the site's own domain. It shows short facts (amount, code, dates) with a link back to the store, and doesn't republish the stores' text or images.
- **The legal picture (US):** courts have generally held that reading public, logged-out pages isn't "unauthorised access" under the anti-hacking law (hiQ v. LinkedIn). However, a site's **terms of use** can still forbid automated access, which is a contract issue. Many big retailers' terms do.
- **Risk:** low at this scale, but not zero.
- **Mitigations already in place:**
  - robots.txt respected (Courts was switched off for this reason)
  - low request rate
  - pages that refuse access are dropped
- **To add:**
  - a contact address in the bot's User-Agent, and a promise to stop on request
  - affiliate feeds for big US retailers once approved
- **Store names:** used only to identify whose deal it is (nominative use), with no logos. The terms already say PerkScan isn't affiliated with any store or bank.

## 4. Gmail

- **Today:** each user pastes a Google Apps Script into their own Google account. Google treats that user as the script's owner, so PerkScan needs no Google verification. The cost is friction: about 5 minutes on a computer, plus an "unverified app" warning.
- **For one-tap "Connect Gmail" later:** reading Gmail through PerkScan's own Google sign-in uses a *restricted* scope. That needs Google's verification plus a yearly independent security assessment (CASA). Reported costs are roughly US$540–1,000+ per year for Tier 2, with 2–8 weeks of lead time. Budget for it before promising one-tap Gmail.
- **Forwarding:** a PerkScan forwarding address avoids Google's review entirely, and is the cheaper next step.

## 5. App Store and Google Play

| Requirement | Status |
|---|---|
| In-app account deletion | ✅ |
| Privacy policy URL | ❌ Publish one (blocker 1) |
| Privacy labels and Data safety form | ✅ Drafted in `docs/APP_STORE_PRIVACY.md`. Update it for interests, shared promotions and store statistics (done in the policy text, not yet in this file). |
| Sign in with Apple (because of Google login) | ❌ Switched off (blocker 3) |
| Demo account for review | ❌ Sign-in uses emailed codes, so reviewers need a demo account or a fixed test code. Give them a test account in the review notes. |
| No SMS permission | ✅ Texts arrive only by Share or Paste |
| Notifications permission asked in context | ✅ On the last onboarding step |
| Play closed test (12 testers, 14 days) | ❌ Needed for new personal accounts (blocker 6) |

## 6. Product quality before launch (not legal, but users will notice)

- **76 of 130 card benefits are still unverified** and show as "Check". On a premium card, Home can show "Ready to use $0" next to several "Check" credits, which is the confusion you flagged earlier. Verify the top cards' benefits against issuer pages before launch.
- **Deals in Trinidad & Tobago start nearly empty:** one store page, until users opt in and the store list grows.
- **Expo tooling vulnerabilities:** `npm audit` reports 4 high and 3 moderate issues in Expo's command-line and build tools (`node-forge`, `uuid`, `xcode`). None of them ship inside the app. Update Expo to the latest 58.x patch before building releases.
- **Ongoing costs:** AI reading is capped (default $2/month for email reading, $3/month for the scout). Supabase's free tier pauses inactive projects, so a paid plan is likely at launch.

## Launch checklist

**Private beta (now):**
- [ ] Hide Canada, the UK, Jamaica, Barbados, The Bahamas and Guyana from the country list, or label them "coming soon"
- [ ] Publish the draft privacy policy and terms at a URL, marked "beta"
- [ ] Add a contact email to the bot User-Agent and the policy
- [ ] Update Expo to the latest patch

**Public launch:**
- [ ] Company formed; developer accounts in the company's name
- [ ] Lawyer-reviewed policy and terms (liability, governing law, minimum age, processors and regions)
- [ ] Lawyer view on the GLBA Safeguards Rule (US)
- [ ] Sign in with Apple on; demo account for App Review
- [ ] Account-deletion web page
- [ ] Play closed test completed (or an organisation account)
- [ ] Top cards' benefits verified
- [ ] Before each new country: its registration or lawyer check
