# AlfiePRO mobile apps (Capacitor)

The iOS and Android apps are built from this web app with [Capacitor](https://capacitorjs.com).
One codebase serves desktop, phone browsers and both stores. They replace the separate Expo app
(Bolt project, last store release 1.1.6 / build 76) once the new build matches it feature for feature.

| | Value |
| --- | --- |
| Bundle ID / application ID | `com.b2zdigital.alfiepro` (same as the Expo app, so iOS ships as an update to App Store id6759854905) |
| Version | 2.0.0 (iOS build 1, Android versionCode 8 — the Expo app reached versionCode 7) |
| Deep-link scheme | `alfiepro://` (same as the Expo app) |
| Web content | bundled from `dist/`, served from `capacitor://localhost` (iOS) / `https://localhost` (Android) |
| iOS packages | Swift Package Manager (no CocoaPods) |

## Everyday commands

```bash
npm run build:native      # vite build + cap sync (copies dist/ and plugins into ios/ and android/)
npm run cap:ios           # open Xcode
npm run cap:android       # open Android Studio
npm run cap:run:ios       # build and run on a simulator or device
```

Live reload on a phone while developing: run `npm run dev -- --host`, then
`CAP_SERVER_URL=http://<your-mac-lan-ip>:5173 npx cap run ios`. Don't release a build made with `CAP_SERVER_URL`.

The build needs the usual `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in `.env`.

Icons and splash screens come from `assets/` (`icon-only.png`, `icon-foreground.png`, `icon-background.png`,
`splash.png`). After changing them run `npm run cap:assets`.

## How the native layer is organised

Everything native lives in `src/lib/native/` and does nothing in a browser:

| File | What it does |
| --- | --- |
| `platform.ts` | `isNative`, `isIOS`, `isAndroid`, `navigateTo()` for navigation from outside React Router, the `X-Client-Info` value |
| `bootstrap.ts` | Start-up: `html.is-native` class, status bar following the Alfie light/dark class, keyboard height (`--native-keyboard`), deep links, Android back button (`alfie-native-back` event first), resume event (`alfie-native-resume`), splash hide |
| `deepLinks.ts` | Maps `alfiepro://` links, universal links and the Expo app's old notification routes (`/(tabs)/calendar` …) to web routes |
| `oauth.ts` | Google sign-in through the system browser sheet and back via `alfiepro://auth/callback`; Sign in with Apple via Supabase ID tokens |
| `authStorage.ts` | Keeps the Supabase session in Preferences on native, so iOS clearing web storage doesn't sign people out |
| `push.ts` | APNs / FCM registration into `push_tokens` — **off** until the server side is ready (below) |

Other native-aware changes: the service worker never registers in the apps
(`utils/registerServiceWorker.ts`); `utils/supabase.ts` uses the native session storage and doesn't read
sessions from the URL on native; the apps skip `MobileAppComingSoon`; `styles/alfie-native.css` holds the
safe-area variables (`--safe-top`, `--safe-bottom` …).

## Still to set up before the first TestFlight build

1. **Supabase Auth → URL configuration:** add `alfiepro://auth/callback` to Redirect URLs (Google sign-in in the app).
2. **Apple Developer:** the App ID `com.b2zdigital.alfiepro` already exists (Expo). Check Push Notifications and
   Sign in with Apple are enabled on it; Xcode's automatic signing picks up `App/App.entitlements`.
   Set `aps-environment` to `production` for App Store builds.
3. **Push (server):** `send-push-notification` only talks to Expo. Add an FCM sender (Firebase project with the
   iOS APNs key uploaded), send by token kind (`platform` = `ios-apns` / `android-fcm` from the new app,
   `ios` from the Expo app), then build with `VITE_NATIVE_PUSH=true`. Android also needs
   `android/app/google-services.json` from Firebase.
4. **Race reminder buttons (lock screen):** send race reminders to the new app with APNs `category: "RACE_REMINDER"`
   and data `club_id` plus `series_id` + `round_name` (series rounds) or `event_id` (single events). The app shows
   "I'm going" / "Can't make it" and writes `event_attendance` the same way as the RSVP buttons. Test on a device:
   iOS only wakes the app briefly for these. Android needs the buttons added in the FCM sender (not done).
5. **Weather keys:** Wind & tides uses `VITE_WEATHER_API_KEY` (OpenWeatherMap) and `VITE_STORMGLASS_API_KEY`
   (tides) through `weather_cache`. Without them the screen shows a Windy wind map instead.
6. **Universal links (optional):** `apple-app-site-association` and `assetlinks.json` on app.alfiepro.com.au,
   plus the Associated Domains entitlement.

## The phone app

`src/mobile/` holds the phone screens built from the mobile design board (styles in `src/styles/alfie-mobile.css`).
The apps always show them; phone browsers see them with `?mobile=1` (otherwise `MobileAppComingSoon` until launch).
First run: Membership due (soft gate, renew via `utils/membershipRenewal.ts`, shared with the desktop screen),
Choose your club (only with more than one), then "Never miss a start" before the system notification prompt.
Race Management on the phone: the Race desk (`screens/RaceDesk.tsx`, data in `mobile/raceDesk.ts`) is built.
Start scoring runs the desktop's own preparation (`utils/scoringStart.ts`) and opens the scoring screen through
the `alfie-start-scoring` event in `App.tsx`. Results everywhere on the phone come from `utils/eventResultsEngine.ts`,
the same code as the desktop results table (dashboards and live pages use it too, via standingsCalculator).
Race day set-up (`screens/RaceSetup.tsx`, data in `mobile/raceSetupData.ts`): Sign on, Skippers, Heats and Race settings.
Saves go through code shared with the desktop scoring screen: `utils/raceSetup.ts` (settings save, skipper list,
member boats, discards) and `utils/heatSetup.ts` (the heat wizard's seeding and the manual / ranking confirm).
Starting and racing (`screens/RaceDay.tsx`, route `/race-desk/event/:key/race`, data in `mobile/raceSession.ts`):
StartBox for the race or heat that sails next, then the race clock, OCS marks, general recall and abandon. What sails
next and each boat's handicap come from `utils/raceProgress.ts`, shared with HeatScoringTable and YachtRaceManager.
Sound is the desktop StartBox engine (`utils/startBoxAudio.ts`); the dial, sound sheet and keep-awake are in
`mobile/startBoxParts.tsx`, also used by the Race Timer. The start time, roll call and marks stay on the phone
(localStorage `alfie-m-race:<eventId>`) until the finish pad records results; "Score the finishes" opens the scoring
sheet for now.

## Scoring tests

`npm test` runs Vitest. `src/__tests__/scoring/` replays real completed rounds (skipper names anonymised, in
`src/__tests__/fixtures/real-events.json`) through the desktop results engine and checks the phone standings match,
plus locked snapshots of HMS and SHRS heat sizes and schedules, the heat sailing order, and the handicap each boat
sails on (checked against the handicaps the desktop recorded in the real rounds). Any change to scoring must keep these passing.

Progress and gaps: `claude/alfie-mobile-app-plan.md` in the AlfiePRO project.
