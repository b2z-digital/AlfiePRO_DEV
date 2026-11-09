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
`mobile/startBoxParts.tsx`, also used by the Race Timer. The start time, roll call, marks and the finish order stay
on the phone (localStorage `alfie-m-race:<eventId>`) until they're handed to the scoring sheet.
Calling the finish (`screens/FinishPad.tsx`, route `/race-desk/event/:key/finish`, matching in `mobile/finishPad.ts`):
tap, voice and keypad feed one finish order kept with Touch mode's own rules (`utils/finishOrder.ts`, shared with
TouchModeScoring and LetterScoreSelector). OCS marks from the start go in as OCS.
Confirm & publish (`screens/ConfirmRace.tsx`, route `/race-desk/event/:key/confirm`, steps in `mobile/confirmRace.ts`):
review, confirm, then HMS heat moves or handicap changes (with override), and the standings. Confirming runs the
scoring screen's own steps from `utils/scoringConfirm.ts` (moved out of YachtRaceManager: handicap calculation with
the club ruleset, heat results and withdrawals, completing a heat, Touch confirm, advancing to the next race,
members' boat handicaps, handicap override), and saves with updateEventResults, a checkpoint and the live status, as
the scoring screen does. Multi-day events still confirm on the scoring sheet: the order is handed over in
`utils/finishHandoff.ts` and Touch mode saves it through its own handlers.
Score together (`screens/ScoreTogether.tsx`, `mobile/scoreTogether.ts`): the scorer's phone opens the desktop's
scoring session (`utils/scoringSessions.ts`, shared with ShareScoringSessionModal; PIN + QR). Spotters open
`/join-scoring/:pin` on a phone (no account; `App.tsx` gives phones the spotter pad, computers the old join page)
and call finishes. Calls travel on the realtime channel `score-together:<session id>` (plus a same-browser
BroadcastChannel); the scorer's phone applies them to the race session with the finish order rules
(`applyRemoteCall`), sends the order back, and asks when two phones record different boats for one place
(`resolveConflict`). Confirming waits until every disputed place is decided.
Landscape (`mobile/orientation.ts`): the app is held upright (@capacitor/screen-orientation) except the finish pad
and the full sheet, which follow the phone. App.tsx treats a phone on its side (short side under 500px) as a phone.
The sideways finish pad shows every boat with the finish order on the left. The full sheet
(`screens/FullSheet.tsx`, `/race-desk/event/:key/sheet`) shows every race, total and nett from the results engine,
drops struck through; tapping a cell runs the scoring screen's cell edit (`editRaceResultIn` in
`utils/scoringConfirm.ts`, moved out of YachtRaceManager.updateRaceResults). Heat and multi-day events are
corrected on the desktop sheet for now.
No signal (`mobile/outbox.ts`, `screens/Sync.tsx`): taps and the finish order always live on the phone; a confirmed
race or heat that can't be saved is kept with the event as it now stands (the race desk uses it), and sent in order
when signal returns. The club's handicap rules are kept on the phone for confirming offline.
Voice: `mobile/speech.ts` uses the in-repo plugin `native/alfie-speech` (Apple Speech on iOS with the race's sail
numbers as hints, Android SpeechRecognizer), installed as the `alfie-speech` dependency, so `npx cap sync` adds it
to `ios/App/CapApp-SPM` and Android. Phone browsers use the Web Speech API where they have it. iOS needs
NSSpeechRecognitionUsageDescription (in Info.plist). The plugin hasn't been built on a device yet: build both apps
once and try holding the voice button before TestFlight.

Ask Alfie (`screens/AskAlfie.tsx`, client in `mobile/alfie.ts`): a full-screen sheet from the centre button (hold it
to go straight to talking). It uses the old app's `ask-alfie` function, so conversations, history and the monthly
question count carry on: answers stream in with the function's control blocks hidden, then show the rig table
("Save to my <boat>" calls `?action=save-rig-settings` after choosing wind and water), race cards and a link to the
phone screen Alfie names. Photos are shrunk before sending; drawings use the desktop's RaceScenarioCanvas. Read aloud
and spoken answers use the `text-to-speech` function (voice "fable") a sentence at a time, falling back to the
phone's own voice. Talking uses `mobile/speech.ts`.
Presence (`mobile/presence.ts`): the phone keeps both `profiles.last_seen` (desktop) and `user_presence` (old app)
fresh and reads both for the green dots. Saved stories live on the account (`mobile/saved.ts`,
user_article_bookmarks; stories saved on the phone before are moved across once). Club feed posts can be hidden
(hidden_posts) or reported (the desktop's `socialStorage.reportPost`). The club feed and chats ask once for the
community guidelines (`screens/Terms.tsx`, terms_acceptance 'v1', the same record the old app kept; terms text from
global_legal_pages).

## TestFlight

`.github/workflows/ios-testflight.yml` builds the iOS app on GitHub's Mac runners and uploads it to TestFlight.
Run it from GitHub (Actions → iOS TestFlight → Run workflow, normally on `dev`) or push to the `testflight` branch.
Build numbers are the run number (2.0.0 (1), (2) …). It never submits to the App Store.

One-off set-up, in the repo's Settings → Secrets and variables → Actions:

| Name | Kind | Where it comes from |
| --- | --- | --- |
| `APPLE_TEAM_ID` | variable or secret | developer.apple.com → Membership details → Team ID |
| `ASC_KEY_ID`, `ASC_ISSUER_ID` | secrets | App Store Connect → Users and Access → Integrations → App Store Connect API → new **Team key** with the **Admin** role (Admin lets Xcode create the distribution certificate and profile itself) |
| `ASC_KEY_P8` | secret | the contents of the downloaded `AuthKey_XXXX.p8` (it can only be downloaded once) |

Maps and weather keys aren't built into the app: the `app-services` Supabase function (`supabase/functions/app-services`)
reads them from Supabase → Edge Functions → Secrets (`GOOGLE_MAPS_API_KEY`, `OPENWEATHER_API_KEY`,
`STORMGLASS_API_KEY`; a few other common names are accepted too), calls OpenWeatherMap and Stormglass for the app,
and hands the Maps JavaScript key to signed-in members. Weather is optional: without `OPENWEATHER_API_KEY`, Wind & tides
shows the Windy map, as the desktop does (Stephen's choice, Nov 2026). `utils/weatherAPI.ts` and `utils/googleMaps.ts` use it
whenever the build has no `VITE_` key, so the website keeps working as before.

Also: Supabase → Auth → URL configuration → add `alfiepro://auth/callback` (Google sign-in); if the Google Maps key
is limited to websites, add `capacitor://localhost` to its allowed referrers. In App Store Connect → TestFlight,
make an internal group (App Store Connect users, no review) or an external group (anyone by email or public link;
the first build of a version needs Apple's beta review, usually under a day).

## Scoring tests

`npm test` runs Vitest. `src/__tests__/scoring/` replays real completed rounds (skipper names anonymised, in
`src/__tests__/fixtures/real-events.json`) through the desktop results engine and checks the phone standings match,
plus locked snapshots of HMS and SHRS heat sizes and schedules, the heat sailing order, and the handicap each boat
sails on (checked against the handicaps the desktop recorded in the real rounds), the finish order (every real race
read back through Touch mode's finish order unchanged), confirming (every real race replayed and confirmed race by
race; handicaps against the desktop; an HMS event heat by heat with promotions), spotters' calls and disagreements,
sending results kept offline in order, and the keypad and voice matching. `src/__tests__/mobile/` covers Ask Alfie
(hiding control blocks while streaming, reading the stream, sentences to speak, rig labels, take-me-there links). Any change to scoring must
keep these passing.

Progress and gaps: `claude/alfie-mobile-app-plan.md` in the AlfiePRO project.
