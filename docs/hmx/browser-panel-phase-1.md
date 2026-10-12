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
- Profile directory IDs and display names by default; display labels containing
  `@` fall back to directory names. A separate, unchecked email consent option
  allows only the `user_name` email recorded in Local State to be returned.
  Missing/invalid values are shown as unavailable, never inferred from a label.
  Recorded emails may be stale and do not prove a signed-in site session.
- No reads of Cookies, Login Data or profile Preferences; no browser launch,
  process termination, copying, account login or config mutation. Metadata
  discovery performs no CDP probing. A separate, explicitly approved connection
  test reads only the Chrome version and closes its own WebSocket. A separate
  Flow-only check can now list allowed tab titles and read fixed page markers
  from one explicitly selected tab, without clicks or generation.
- Symlink/junction traversal refusal; bounded Local State metadata reads;
  malformed metadata fallback and per-browser permission/error indicators.
- Multiple profile selections in screen-local state. They are neither persistent
  settings nor browser-use permission, and start no tasks. Switching Hermes agent
  profile clears consent and selections.
- A dedicated numeric selection output and translation-excluded panel protect
  dynamic text from browser auto-translation. Use the dashboard's own language
  selector for Turkish/English. The selection summary stays visible while scrolling.
- Email consent changes clear the inventory and selections. Rediscovery is
  required with the new scope; revocation removes emails from component state.
- Turkish/English page copy, desktop/mobile layout, loading, retry and empty states.

## Deliberately not implemented yet

The configuration summary remains **not verified**. A separate one-shot transport
test can report a successful version check, never a persistent connection.
Found profiles are **not connected** and
their account identities are **not verified**. The explicit Flow-tab marker check
never maps a tab to a discovered profile or Gmail identity. This page does not yet
create persistent profile connections, control Flow production, execute parallel profile tasks, stream
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

### Email and selection follow-up

Use Ctrl+Shift+R after rebuilding. Disable Chrome's page translation and choose
Turkish in the dashboard's own language selector if desired. Allow metadata
discovery; optionally grant the separate email permission, then discover again.
Only recorded local emails should appear; other profiles show the unavailable
message. Select four profiles: the counter must show 4, then 3 after deselecting
one. Removing email consent clears the inventory and count immediately.
Rediscover with email permission off: no email addresses should appear.

The discovery transport now explicitly sends `Content-Type: application/json`.
The initial Windows 422 validation error was caused by a missing JSON header, not
proof of filesystem access denial. After that fix, the user confirmed the real
Windows profile list appeared. Actual browser attach remains untested.

Follow-up validation: 441 web tests, 21 inventory/router tests, TypeScript,
changed frontend file lint and production build passed. A local Chromium fixture
with 65 synthetic profiles verified four selections, deselection to three,
email opt-in/revocation and no horizontal overflow at 390px. A synthetic external
text-replacement test reproduces the stale counter with the old mixed-text
structure and passes with the new protected output. This is not a claim that the
user's Chrome translator itself was exercised. Real Windows email metadata and
the revised counter still need the user's acceptance test.

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

### One-shot connection-test preparation

The new connection card requires its own consent and a button press. It never
starts from a page load, profile selection or metadata/email discovery.
Validation: **462 web tests**, **40 inventory/router/transport tests**, and
**12 CLI probe tests** passed, plus TypeScript, changed-file frontend lint and
the production build. Transport tests use synthetic discovery files and a local
WebSocket CDP fixture; visual tests use mocked responses. Desktop/mobile checks
verify disabled waiting controls, no automatic probe, safe timeout/retry, no
mobile horizontal overflow and no page errors.

Actual Windows Chrome approval, profile/account identity and Flow access remain
pending the user's test. See
[connection preparation](browser-connection-preflight.md) for the exact scope.

### Explicit Flow-tab read-only follow-up

The user's Windows Chrome version test returned Chrome 154 / CDP 1.3 with the
test connection closed. They manually opened Flow; this is not evidence of an
automated Flow check. The new independent card lists exact-origin Flow tabs,
requires explicit radio selection, revalidates the target and reads only fixed
page-state markers under Chrome's side-effect guard. It never automatically
selects another tab or asserts Gmail/account identity. See the preparation guide
for the command allowlist, privacy limits and Windows acceptance procedure.

Validation: **471 web tests**, **64 targeted Python tests** (isolated Python 3.13),
TypeScript, changed-file lint and production build passed. Synthetic CDP tests
verify chosen-target-only attachment/detachment and safe failure states. A local
Chromium DOM fixture exercises the actual guarded expression with English,
Turkish and Russian labels, blocks a different origin and verifies no clicks or
password return. Desktop/mobile UI fixtures verify explicit consent/selection,
stale-target failure without fallback, revocation clearing and no horizontal
overflow. These are local fixtures, not a real Windows Flow/account test.

Actual Windows Flow marker-check acceptance, profile identity mapping, parallel
sessions, live view and production remain pending. Main is not merged.


### Local image-production draft (no dispatch)

The user's manual two-image Flow Agent test produced a downloaded project ZIP
containing two JPGs with `001_sahil_…` and `002_orman_…` filename prefixes; the
screenshot shows an export suffix, not exact filename equality. This verifies
only that manual workflow. Flow did not show the expected separate generation
approval, so its setting cannot be treated as our spending-authorization boundary.

After an explicitly selected tab returns readable Flow markers (including an
inconclusive session result), the dashboard now exposes a **local-only** image
draft. It accepts an exact Flow project URL as an unverified draft reference and
up to 100 `name | prompt` rows. It previews groups of at most ten, one planned
image per prompt, and target names. No execution endpoint or production button
exists: draft checking does not send prompts, change Flow settings or grant
spending permission. Project/tab matching and model/cost validation remain
unimplemented. Drafts are not persisted and clear on refresh, target/consent
change or a fresh read-only check. Editing either input clears the preview.

Names use safe ASCII stems with Windows reserved names, separators/extensions
and case-insensitive collisions rejected. Empty/oversized prompts, oversized
lists and more than 100 entries block the complete preview rather than silently
truncating a batch. A JPG filename preview is a target, not proof of export type.
Automatic production, result matching, job resume and post-download renaming
remain pending; do not use this client-only validation as execution authority.

Validation: **490 web tests / 66 files**, TypeScript, changed-file ESLint and
production build passed. Local Chromium fixtures verify target-bound display,
2-image/1-group preview, no extra API calls on draft preparation, clearing on
consent loss, desktop/mobile layout and no horizontal overflow. These fixtures
are not a Windows production automation test. Backend/CLI code is unchanged.
