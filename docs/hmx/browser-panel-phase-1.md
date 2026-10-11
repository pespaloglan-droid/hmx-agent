# HMX browser panel — step 1

Base: Hermes fork at `79b45d1647f6b5680768d851c4c406e8cc550a1e`.
Branch: `feat/browser-profile-panel`. The agent loop and chat interface are unchanged.

## Implemented

- `/browser` dashboard page and Browser / Tarayıcı navigation entry.
- Authenticated `GET /api/browser/status`: selected **Hermes agent profile**
  configuration, with no CDP endpoint, credentials or token values returned.
- Authenticated `POST /api/browser/discover`, requiring explicit metadata-discovery
  consent. It accepts no filesystem path from the client.
- Read-only discovery of standard Chrome, Edge, Brave and Chromium directories
  for the **OS user running the dashboard backend**. A remote dashboard does not
  scan the viewing computer.
- Profile directory IDs and display names only. Account emails are not returned;
  display labels containing `@` fall back to directory names.
- No reads of Cookies, Login Data or profile Preferences; no browser launch,
  process termination, copying, account login, CDP probing or config mutation.
- Symlink/junction traversal refusal; bounded Local State metadata reads;
  malformed metadata fallback and per-browser permission/error indicators.
- Multiple profile selections in screen-local state. They are neither persistent
  settings nor browser-use permission, and start no tasks. Switching Hermes agent
  profile clears consent and selections.
- Turkish/English page copy, desktop/mobile layout, loading, retry and empty states.

## Deliberately not implemented yet

Connection status is **not verified**. Found profiles are **not connected** and
their site sessions are **not checked**. This page does not yet attach to an
existing Chrome profile, control Flow, execute parallel profile tasks, stream
video/screenshots, or stop browser tasks. The page describes these as future work,
not working buttons or fabricated activity.

Hermes agent profiles and Chrome browser profiles are different concepts.
Selecting either must not silently authorize the other.

## Next acceptance gates

Connection review, implementation boundaries and the follow-up acceptance matrix:
[test-before-connection preparation](browser-connection-preflight.md).

1. Decide and verify a supported, explicitly approved browser connection method
   without copying personal profile data or bypassing Google sign-in protections.
2. Verify a single profile against `https://flow.google.com/`. A configured address
   must not be presented as proof of a signed-in account.
3. Verify two independent sessions before enabling parallel work. Same-profile
   conflicting operations must queue; different profiles must not share account
   state or accidentally control each other's tabs.
4. Add per-profile history, actual timestamped preview and task cancellation.
   Credit-consuming production remains a separate user authorization.

## Windows test instructions

Stop the running dashboard using Ctrl+C in its PowerShell window. Keep the model
API server running. In the checkout, first inspect local changes:

```powershell
cd "$HOME\hmx-hermes"
git status --short
```

If this reports tracked edits, stop and review them; do not discard or force-switch.
For the original single-branch shallow clone:

```powershell
git fetch origin feat/browser-profile-panel
git switch -c feat/browser-profile-panel FETCH_HEAD
```

If the branch is already checked out, use
`git pull --ff-only origin feat/browser-profile-panel` instead.
In a normal, non-administrator PowerShell:

```powershell
$env:HERMES_HOME = Join-Path $HOME ".hermes-hmx-test"
$env:HERMES_RUNTIME_DIR = Join-Path $env:HERMES_HOME "tools"
.\activate.ps1
hermes dashboard --host 127.0.0.1 --port 9119
```

Allow the normal dashboard rebuild; do not use `--skip-build` with old assets.
Visit `http://127.0.0.1:9119/browser`. The page must initially show no discovered
profiles. Grant metadata-discovery consent and press **Profilleri keşfet**.
Verify local profile labels, select two profiles and confirm the counter. This
must not open Chrome or initiate a Flow login. Return to Chat and verify that the
existing chat experience still works.

Do not press **Update Hermes** during this feature-branch test: the generic updater
is not the review/merge process for this fork. Keep `main` unchanged until acceptance.

Do not publish real account lists, profile paths, cookies or API keys in test
screenshots.

## Development validation scope

Targeted Python tests cover read-only inventory and real FastAPI router requests
with isolated authentication/config seams. They are not a complete Hermes agent
runtime test and do not exercise Windows Chrome access.

The web test suite, TypeScript check, production build and desktop/mobile visual
fixture checks are run separately. Visual fixtures are synthetic profile metadata,
not evidence of an actual Chrome connection. The final Windows acceptance test is
performed by the user before proceeding to step 2.

### Results for this change

- Targeted Python inventory/router tests: **14 passed** (Python 3.13 isolated test
  environment; not the full Python 3.14 Hermes runtime).
- Entire web Vitest suite: **62 files / 438 tests passed**.
- Web TypeScript check: passed.
- ESLint on the new page/test/type files and updated page-title helper: passed,
  no warnings.
- Production dashboard build: passed.
- Local Chromium visual fixture: 1360px desktop and 390px mobile; no page errors,
  no horizontal overflow on mobile, two-profile selection counter verified.
- Windows profile discovery / actual Chrome attach: **not tested here**.