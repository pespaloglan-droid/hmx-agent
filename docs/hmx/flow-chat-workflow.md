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
