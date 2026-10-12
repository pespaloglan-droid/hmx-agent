# HMX Flow workflow — chat acceptance contract

The final user-facing entry point is Hermes Chat, not a mandatory dashboard wizard.
Example request: “Chrome Profil 5 ile bu 100 promptu Flow Agent modunda 10'ar 10'ar
görsel olarak üret; listedeki isimleri kullan, projeyi indir ve bitince bildir.”
This is the requested end state, **not a supported command in the current build**.

## Required execution contract

- Resolve a real Chrome browser profile, separately from a Hermes agent profile.
  Directory label `Profile 5` or an old Local State email is not an authenticated
  browser/Google session mapping. Refuse unknown mapping; never use a default
  account or mutate a process-global CDP endpoint to simulate per-profile routing.
- Pin an explicitly permitted tab and exact project. Revalidate before each
  effectful operation; do not navigate another tab/account on loss of target.
- Preview immutable named image rows and the intended model, aspect ratio,
  per-prompt output count and spending scope. Obtain a separate production
  authorization; Flow's “Always ask” setting was not reliable in the manual test.
  A bounded batch authorization can cover subsequent groups without asking for
  every prompt, but it is not unlimited future authorization.
- Send at most ten prompt rows per group. Record an attempt before dispatch so
  uncertain transport outcomes cannot trigger duplicate generation. Agent prose
  saying “done” is not proof: reconcile actual generated assets to the named rows.
- Persist job/attempt/result status in the owning Hermes profile, with sensitive
  input handled deliberately. Resume only known unfinished work; an uncertain
  submission requires reconciliation rather than an automatic resend.
- A stop request prevents new submissions and cancels queued work. It must report
  already-submitted remote work honestly; refunds or remote cancellation are not
  guaranteed. Different authenticated profiles need independent locks and routing.
- Verify naming, download completion, expected file count and file/content
  correspondence. Export suffixes appeared in the two-image manual ZIP test;
  exact desired filenames require verified post-download renaming, never inferred
  from archive order. Avoid overwriting existing user files.
- Report completion/errors, missing outputs and the local download location in
  Chat. Do not claim success from a menu click or fabricate progress/live preview.

## Current implemented boundaries

Profile/email metadata discovery, one-shot Chrome transport check, selected
Flow-tab markers, local-only batch draft, exact-project/composer preflight and separately consented
composer text staging (no submit) are implemented. The user validated Windows transport, Flow workspace markers and
the two-row local draft. The user manually produced, named and downloaded two
images through Flow Agent; this was not Hermes automation. The user also verified the Windows project/composer preflight: one empty
contenteditable and a unique send control. The user verified actual Windows text staging and send enabling. A separately
consented two-row test can now click the recorded project's send control once,
with exact message/digest matching, selected Agent verification (`aria-pressed=true`)
and a durable no-resubmission fence. Actual Windows dispatch acceptance is pending.
A click is not proof of production success; output count and credits are not hard-capped. It stores a profile-scoped durable attempt
fence without persisting prompts, but is not a generation job tracker.

Beyond this separately approved single-click test, batch execution and hard budget
enforcement, account/profile mapping, durable job tracking, asset reconciliation,
automated download and Chat integration are **not implemented**. They must share one execution authority, not
separate dashboard/Chat implementations. A general plugin/CLI boundary is
preferred over adding vendor-specific core model tools; respect the repository's
out-of-tree SaaS-plugin policy. Do not ship a fake production button in the interim.


### Read-only Agent predicate diagnostic

The real Windows submission remains blocked with `agent_not_selected` after a confirmed
backend restart at `3ff18ba8`, despite a screenshot of the selected chip. The parent-selector
regression test was not proof that this live issue was resolved. Do not repeat submissions,
clear the Flow composer, or replace the staged record to diagnose this.

For an existing stage ID, the submit card now offers **Agent düğmesi tanısı — salt okunur**.
A fresh diagnostic-only checkbox plus **Agent durumunu oku (gönderme yok)** sends the ID
and explicit consent, not prompt text, target, URL or JavaScript. The protected, profile-scoped
endpoint resolves the saved target/project. One fixed evaluation with `throwOnSideEffect:true`
reports matched/visible/selected-visible counts, the unique button's enabled state and a
closed `aria-pressed` enum. It reads no prompt, writes no composer text, clicks nothing,
and never changes the stage ledger or rearms submission fences. It does not verify account,
model, output count or production acceptance. If the Chrome read is blocked, it reports that
failure instead of falling back to an effect-enabled evaluation.

The existing one-button + enabled + `aria-pressed=true` submission guard remains unchanged;
its selector/visibility predicate is shared with diagnostics. Native local Chromium tests
exercise the read-only CDP evaluation and check that prompt text and click counts stay unchanged.
The user must share the diagnostic result to identify the live failing predicate. This is a
diagnostic addition, not a claimed fix for the remaining Windows submission issue.


### Diagnostic-only current tab selection after a Chrome restart

A stored attempt is bound to its original Chrome target. Reopening Chrome can retire that
identifier: `target_unavailable` is not evidence of inactive Agent mode. A fresh tab-list
selection does not rewrite the saved binding. Under the read-only Flow tab check, an observed
current tab (including an inconclusive session read) now exposes **Yeniden açılan sekmede Agent
tanısı — gönderim yok**. Enter the existing attempt ID, then grant fresh diagnostic consent.

Only this diagnostic request may carry a bounded `current_target_id`. The owning profile's
saved record supplies the expected project; an absent record or different project is refused.
The server reads the explicitly selected target with the same fixed, side-effect-blocked Agent
evaluation. It never automatically chooses a replacement target. The saved target, state,
digest and submission fences are unchanged. The production-submit endpoint still rejects
caller-selected targets and only uses the original saved binding. An empty composer remains
empty, and successful Agent diagnostics do not make the old staged text eligible to submit.

After updating, keep the existing HERMES_HOME selected in the dashboard PowerShell, refresh
only Hermes, list/check/select the current Flow tab again, and use the new diagnostic-only
panel. Do not reload Flow, restage text, or repeat production approval to perform this read.
