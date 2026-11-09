# Grades Calculator

Work out the grades you still need to pass a class (asignatura). It runs as a web app, an Android app and an iOS app.

**Your data lives on your device.** The apps work fully offline with no account. Optionally, you can sign in to a self-hosted sync server (multiple user accounts) to back up your classes and keep several devices in sync.

- **Weighted evaluations, nested as deep as you like.** An evaluation can be a group (e.g. *Tareas* 20%) with its own weighted sub-evaluations (*Tarea 1* 50%, *Tarea 2* 50%).
- **Every class has an exam.** You set its weight and an optional minimum exam grade needed to pass.
- **Needed grades.** Every pending evaluation gets the same needed grade, chosen so the final grade lands exactly on the passing grade. If that grade would be below the minimum exam grade, the exam is set to the minimum and the other pending grades are recalculated.
- **Statuses:** *passed*, *failed*, *still achievable*, *already passed* and *not achievable*.
- **Grading scale** (default 1.0–7.0, pass 4.0). It applies to all your classes and syncs between your devices.
- **Unlimited saved classes**, with a class selector that shows each one's status and projected grade.
- **English and Spanish** on every platform. The app follows the device language, and you can override it per device in Settings.
- **Backup:** export your classes to a JSON file and import it on any platform.

## Storage and sync

| Platform | Where data is stored |
|---|---|
| Android | `files/data.json` in the app's private storage (included in Android's auto backup) |
| iOS | `data.json` in the app's Application Support folder (included in iCloud/device backups) |
| Web | the browser's `localStorage` (per browser and per site address) |

Sync is optional. Every class carries the time it was last modified and a deleted flag (deletions are kept as tombstones so they reach other devices). When a device syncs, it sends everything it has. For each class, the server keeps whichever copy is newest and returns the merged result, which the device merges back using the same rule. The grading scale syncs the same way. The merge rule lives in `calc/src/sync.ts`, ported to Kotlin and Swift, and all three versions are checked against `spec/merge-cases.json`.

## Layout

| Path | What |
|---|---|
| `flake.nix` | Dev shell with Node 24, PostgreSQL, JDK 17, Android SDK, Swift 6 and xtool. **Use it for every command** |
| `spec/` | Shared test cases (`calc-cases.json`, `merge-cases.json`). The TypeScript, Kotlin and Swift code must all pass them |
| `calc/` | TypeScript calculation engine and sync merge rule (used by the server and the web app) |
| `server/` | Optional sync server: Fastify + PostgreSQL, JWT auth, `/api/sync`; also serves the built web app at `/` |
| `web/` | React + Vite web app |
| `android/` | Kotlin + Jetpack Compose app |
| `ios/` | SwiftUI app built with [xtool](https://github.com/xtool-org/xtool); `ios/GradesCore` holds the calculator, models and API client (testable on Linux) |
| `scripts/` | `check-locales.py` (checks en/es key parity on all platforms), `sync-ios-strings.py` (generates the iOS strings from the Android ones) |

## Dev environment

All tooling comes from the flake, so the host's own Node, Java etc. are never used:

```sh
nix develop          # or: direnv allow  (uses .envrc)
```

Prefix one-off commands with `nix develop -c`, e.g. `nix develop -c npm test`.

## Sync server + web

```sh
nix develop -c npm install
nix develop -c npm test              # calc + merge specs, server sync tests (temporary Postgres), web tests
nix develop -c npm run typecheck
```

Run locally against your own PostgreSQL:

```sh
export DATABASE_URL=postgresql://user:pass@localhost/grades JWT_SECRET=$(openssl rand -hex 32)
nix develop -c npm run dev -w server     # API on :3000, runs migrations on start
nix develop -c npm run dev -w web        # web on :5173, proxies /api to :3000
```

Deploy with Docker/Podman Compose (PostgreSQL + one app container serving the API and the web app):

```sh
cp .env.example .env     # set JWT_SECRET (32+ chars) and POSTGRES_PASSWORD
docker compose up -d --build
# open http://localhost:3000
```

### Web app as an installable PWA

The web app is a Progressive Web App: after one visit it loads and works with no network, and browsers offer to install it ("Add to Home screen" / "Install app"). Its files (`web/dist` after `npm run build -w web`) are fully static, so they can be hosted anywhere (GitHub Pages, Cloudflare Pages, Netlify…) with no server. The sync server is only needed for syncing.

It is published to GitHub Pages at <https://dvher.github.io/grades_calculator/> by `.github/workflows/pages.yml` on every push to `main` that touches `web/` or `calc/`. To build for another sub-path, set `BASE_PATH` (e.g. `BASE_PATH=/grades_calculator/ npm run build -w web`); it defaults to `/`. On iPhone, open the link in Safari and choose Share → Add to Home Screen.

Browsers only enable offline mode and installing on **HTTPS** or `http://localhost`. On a plain-HTTP LAN address such as `http://192.168.1.245:3000` the app works while the page is open, but it can't be installed or opened offline. A page served over HTTPS can also only sync with an HTTPS server (browsers block mixed content).

### API

All routes are under `/api`. Errors look like `{ "error": { "code": "EMAIL_TAKEN", ... } }`, and clients translate the `code`.

| Method | Path | Body / notes |
|---|---|---|
| POST | `/auth/register`, `/auth/login` | `{ email, password }` → `{ token, user }` |
| GET | `/me` | `{ id, email }` |
| POST | `/sync` | `{ classes: StoredClass[], settings?: { scale, scaleUpdatedAt } }` → the merged `{ classes, settings }` |

Send `Authorization: Bearer <token>` on `/me` and `/sync`. Each account only sees its own classes.

## Android

```sh
cd android
nix develop .. -c ./gradlew testDebugUnitTest assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

To sync, open Settings → *Sync between devices* and enter your server's address (e.g. `http://192.168.1.10:3000`; from the emulator the host machine is `http://10.0.2.2:3000`).

## iOS (xtool)

One-time setup: sign in with your Apple ID, then install the iOS SDK from an `Xcode.xip` you download from Apple.

```sh
cd ios
nix develop .. -c xtool setup
```

Then:

```sh
nix develop .. -c sh -c 'cd GradesCore && swift test'   # calculator tests, runs on Linux
nix develop .. -c xtool dev                              # build, sign and install on a connected iPhone
nix develop .. -c xtool dev build --ipa                  # just build an .ipa
```

To sync, open Settings → *Sync between devices* and enter your server's address.

## Translations

The web app's strings are in `web/src/locales/{en,es}.json`. On mobile, Android's `strings.xml` files are the source of truth. After editing them, run `python3 scripts/sync-ios-strings.py` to regenerate the iOS strings, then `python3 scripts/check-locales.py`.
