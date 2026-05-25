# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Per `README.md`: this plugin is not actively maintained except for automated dependency updates. The maintainer uses it personally and only with locks. Don't add speculative features for other device types unless asked.

## Commands

- `npm run build` — `clean` + `tsc` (emits to `dist/`).
- `npm run tsc` — type-check only, no emit. Use this for fast feedback.
- `npm run lint` / `npm run lint:fix` — ESLint over `src/**.ts`.
- `npm run prettier` / `npm run format` — repo-wide check / write.
- `npm run watch` — first-time sets up `test/hbConfig/`, then runs `tsc && homebridge -U ./test/hbConfig -I -D` under nodemon (see `nodemon.json`). Logs go to `test/hbConfig/homebridge.log`.
- There is no test suite — `npm test` is a stub that exits 0. Don't claim tests pass; verify behavior by running `npm run watch` against a real SmartRent account or by type-checking.

Husky + lint-staged run prettier/eslint on commit; commitlint enforces Conventional Commits. Releases are automated via semantic-release on `main`/`next`/`beta`/`alpha` — never bump `package.json` version manually.

## Module system

`"type": "module"` with `tsconfig` `module: nodenext`. **All relative imports must use the `.js` extension** even though sources are `.ts` (e.g. `import { ... } from './platform.js'`). Node ESM resolution requires it; TypeScript rewrites at emit time.

## Architecture

Homebridge dynamic platform plugin. Entry: `src/index.ts` → `src/platform.ts` (`SmartRentPlatform`).

**Device pipeline:**

1. `SmartRentApi.discoverDevices()` (`src/lib/api.ts`) calls `GET /units` → picks unit by `config.unitName` (or first) → `GET /hubs/:hubId/devices`.
2. For each device, `platform._initAccessory()` maps SmartRent `device.type` → an Accessory class via `ALLOWED_DEVICE_TYPES` and the `enable*` config flags. Type → class:
   - `sensor_notification` (with `leak` attr) → `LeakSensorAccessory`
   - `entry_control` → `LockAccessory`
   - `switch_binary` → `SwitchAccessory`
   - `thermostat` → `ThermostatAccessory`
   - `switch_multilevel` → `SwitchMultilevelAccessory`
3. Accessory UUID is derived from `device.id` — keep this stable or HomeKit will lose pairings. Cached accessories are restored via `configureAccessory()`; missing devices are unregistered each discovery cycle.

**Two channels to the SmartRent API** (`src/lib/client.ts`):

- `SmartRentApiClient` — REST (axios) at `https://control.smartrent.com/api/v3`. Used for state reads (`getState`/`getData`) and writes (`setState` → PATCH `/hubs/:hubId/devices/:deviceId`). `setState` stringifies booleans/numbers before sending.
- `SmartRentWebsocketClient` — WS at `wss://control.smartrent.com/socket/websocket`. Phoenix-style frames `[null, null, "devices:<id>", event, payload]`. On `attribute_state` events it dispatches to per-device handlers registered via `_emitize(this.event, "<deviceId>")`. Accessories subscribe to push updates instead of polling. WS auto-reconnects on close/error.

**Auth** (`src/lib/auth.ts`): JWT-based session persisted to `<homebridge storagePath>/smartrent/session.json`. Flow: POST `/authentication/sessions` with email/password → if response contains `tfa_api_token`, generate TOTP from `config.tfaSecret` via `otplib` and POST `/authentication/sessions/tfa`. Access token expiry is decoded from JWT and refreshed 60s early. **Refresh-token flow is commented out** (`_refreshSession`) — re-auth from scratch when the access token expires. Don't reintroduce it without confirming the API still supports it; that's why it was removed.

**Layout:**

- `src/devices/` — typed response shapes (`DeviceData<T, BatteryPowered>`) per device type, unioned as `DeviceDataUnion`.
- `src/accessories/` — HomeKit service/characteristic wiring per device type. Each receives `(platform, accessory)` and registers handlers on `Service` characteristics.
- `src/lib/request.ts` — base URLs, paths, headers (mimics Safari/web client; bumping `APP_VERSION` may be needed if SmartRent rejects the user agent).
- `src/lib/config.ts` — `SmartRentPlatformConfig` shape; user-facing schema is `config.schema.json`.

## Conventions

- ESLint config (`eslint.config.mjs`): single quotes, 2-space indent, `max-len: 140`, `eqeqeq`, `curly: all`. Run `npm run lint:fix` before committing.
- Prettier handles formatting; don't hand-tweak whitespace.
- Conventional Commits — `feat:`, `fix:`, `chore(deps):`, etc. drive semantic-release versioning.
- Renovate manages dependency PRs; most recent activity on the repo is dependency bumps.
