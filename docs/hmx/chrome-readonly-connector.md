# Local Chrome read-only dashboard connector

This is a separate dashboard inspector, **not** a Chat agent controller. The external
companion is installed independently in each authorized Chrome profile. Its installation
UUID and manually verified `Default` / `Profile N` label are paired to the explicit
Hermes profile/home; labels do not establish a site's signed-in account.

## Enable and pair

Configure `browser.readonly_connector.extension_origin` to the companion's exact
`chrome-extension://<32-letter-extension-id>` origin through `hermes config set`.
Default is empty/disabled. The pilot companion uses
`chrome-extension://fgpieoocbpkfjaidphijghloijhfgead` and a fixed
`ws://127.0.0.1:9119/api/browser/connectors/ws` endpoint. Other dashboard ports are not
supported by that companion version. Do not substitute a general API/session key.

The dashboard pair action uses its existing `_require_token` authentication and the
existing single-use 30-second WS ticket manager. Ticket metadata pins the home,
Hermes profile, Chrome directory id, installation UUID, exact extension Origin and
server-created read-only session. The upgrade carries the ticket as a subprotocol,
not a query URL. The secret should never be shared in chat or screenshots.

Only a loopback peer/Host is accepted. Hello must match the pinned installation and
folder with exactly `browser_tabs` and `browser_screenshot` capabilities. A duplicate
live connection for the same home/Chrome directory is refused, not replaced. Socket
cleanup is owner-specific. Restart/disconnect loses all connections; no reconnect,
profile fallback, old-target reuse or profile-directory copying is performed.

## Data and actions

Authenticated `/api/browser/connectors` lists only the authenticated principal's connections in that Hermes home.
Explicitly consented `/read` dispatches one bounded read through the existing broker,
using the separate `dashboard-readonly` transport family and `readonly:` principal.
No actual Chat session is bound. `/disconnect` cancels pending work and closes the
exact connection. Existing privileged controller identity requirements are unchanged.

The companion exposes only normal non-incognito tab titles and HTTP(S) origins,
not full private page URLs. Screen access uses Chrome's existing `activeTab` grant,
pinned to the web page/window explicitly approved at connection time; page/tab change
fails closed. No script injection, click, navigation, typing, downloads, production,
cookie/password access or raw CDP is available. Network authorization is separate from
local-preview authorization; revoke it to disconnect. Tickets/images are not persisted
by the connector; the dashboard displays previews in memory, not to a model.

The external package retains its stable manifest key/extension id on update, allowing
Chrome to retain the installation UUID and folder label. Uninstalling clears that
storage. A copied/cloned profile may carry a duplicate UUID; users must verify labels
and pair explicitly. The connection is not account/email verification.

## Tests and limitations

Behavior tests cover auth-before-body, strict consent/action/field allowlists, ticket
expiry/one-use/purpose/Origin/Host and hello binding, scoped concurrent results,
disconnect fences, output bounds, explicit UI actions, masked ephemeral codes and
late result handling. Companion tests additionally use native Chromium service workers
and two profile directories under one temporary user-data root against a local owned
fixture. Real Windows toolbar `activeTab` capture requires user acceptance; headless
extension-tab tests do not fabricate that grant.

Next work is explicit agent-session authorization/binding, task actions and generic
multi-profile scheduling. This inspector does not claim those capabilities.
