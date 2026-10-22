# Building and testing release versions (EAS)

PerkScan builds with Expo Application Services (EAS) using `eas.json`:
- **preview:** an Android APK you install directly, for you and testers.
- **production:** store builds. Android goes to Google Play internal testing, iOS to TestFlight.

## One-time setup (Windows, VS Code terminal)
1. `npm install -g eas-cli`, then `eas login`. A free Expo account works.
2. `eas init`. This creates the project and prints its id. In PowerShell, set it for builds:
   `$env:EAS_PROJECT_ID="<the id>"`. Or add `EAS_PROJECT_ID=<the id>` to `.env`; it's not a secret.
3. Give EAS the app's public settings, the same values as your `.env`:
   - `eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value https://YOUR-PROJECT.supabase.co --visibility plaintext`
   - `eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value sb_publishable_... --visibility plaintext`
   - Repeat both for `--environment production`. Optional: `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_SHORTCUT_URL`.
   - These are public app settings. Never put the service-role key or the Anthropic key in the app.

## Android: free
- `eas build -p android --profile preview`. When it finishes, open the link on an Android phone and install the APK.
- **Google Play internal testing:**
  - Needs a Google Play developer account (one-time US$25).
  - Run `eas build -p android --profile production`, then `eas submit -p android --profile production`. The first
    upload must be done by hand in the Play Console.
  - Before testing starts, Play also asks for the data-safety form (`docs/APP_STORE_PRIVACY.md`) and a privacy policy
    URL.

## iPhone: needs a paid Apple Developer account
- **TestFlight and any install on a real iPhone** need the Apple Developer Program (US$99/year). Without it, EAS can't
  sign iOS builds for a device.
- **Once you have it:** `eas build -p ios --profile production`, then `eas submit -p ios`. EAS sets up certificates
  and profiles for you, and the build appears in TestFlight after Apple's processing.
- **Until then:** use the web version (`npx expo start` → w), or the Android emulator or an Android phone.
- **Sign in with Apple:** turning it on (`EXPO_PUBLIC_ENABLE_APPLE_SIGNIN=true`) also needs the paid account.

## Before each store release
- [ ] `npm run typecheck && npm run lint && npm test`, and the database tests (`npm run test:db`).
- [ ] `npx supabase db push`, and redeploy any changed functions: `ingest`, `process-inbox`, `account`.
- [ ] The privacy policy and terms are final and published, and the store privacy forms match
      `docs/APP_STORE_PRIVACY.md`.
