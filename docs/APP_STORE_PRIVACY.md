# App Store privacy label and Google Play data safety: notes

These notes answer the store forms based on what the code does today. Re-check them whenever data handling changes, and
have them reviewed along with the privacy policy (`src/domain/legal.ts`, shown in the app under Settings → Privacy
policy).

## Apple: "App Privacy" (data types)

| Data type (Apple's category) | Collected? | Linked to the user? | Used for tracking? | Purpose |
|---|---|---|---|---|
| Contact Info → Email Address | Yes (sign-in) | Yes | No | App Functionality |
| Financial Info → Other Financial Info (card product and last 4 digits; credits used) | Yes | Yes | No | App Functionality |
| Purchases → Purchase History (store, amount, date, from receipts and bank alerts you send) | Yes | Yes | No | App Functionality |
| User Content → Emails or Text Messages (cleaned text, deleted once read, at most 24 h) | Yes | Yes | No | App Functionality |
| User Content → Other User Content (reviews, perks you add) | Yes | Yes | No | App Functionality |
| Usage Data → Product Interaction (only if `EXPO_PUBLIC_POSTHOG_KEY` is set) | Yes | **No** (random install id) | No | Analytics |
| Identifiers → Device ID | No: the analytics id is a random per-install UUID, not a device identifier | — | — | — |
| Location, Contacts, Health, Browsing, Diagnostics | No | — | — | — |

- **Tracking:** none. There's no cross-app tracking and no advertising SDKs, so no ATT prompt is needed.
- **Third parties:**
  - Supabase (hosting)
  - Anthropic (reads the cleaned email/text content to extract offers)
  - PostHog (anonymous analytics, optional)
- **Account deletion:** in-app, under Settings → Export or delete my data. Apple requires this for apps with account
  creation.

## Google Play: "Data safety"

- **Data collected:**
  - Personal info: email address
  - Financial info: other financial info (card last 4 digits); purchase history
  - Messages: emails, SMS or MMS (only those the user sends; deleted once read)
  - App activity: other user-generated content; app interactions (anonymous, optional)
- **Shared with third parties:** no. Service providers processing data on our behalf (Supabase, Anthropic, PostHog)
  don't count as "sharing" under Play's definition. Confirm this when filing.
- **Encrypted in transit:** yes (HTTPS only).
- **Users can request deletion:** yes. It's in the app, and also needs a web link for the Play listing. **TODO:**
  publish a simple web page explaining how to delete an account.
- **SMS permission:** none. PerkScan never requests `READ_SMS`; texts arrive only by Share or Paste. Play policy
  restricts SMS permissions to default SMS apps.

## Before submitting
- [ ] Finalise the privacy policy and terms with a lawyer, publish them at public URLs, and add the URLs to both store
      listings.
- [ ] Decide whether analytics is on in production. If it is, keep "Usage Data → not linked" on Apple and "App
      interactions" on Play.
- [ ] Publish the account-deletion web page (Play requirement).
