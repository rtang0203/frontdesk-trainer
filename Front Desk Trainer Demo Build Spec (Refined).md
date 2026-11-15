# Front Desk Trainer: Demo Build Spec (Refined)

Nov 14, 2026 · @Randy Tang · Refines the Nov 13 spec

This spec is written for a coding agent building the demo from an empty repo. It covers starting a practice call from the web page, receiving the transcript from Retell, scoring it with an LLM, and showing a scorecard on a web page. The voice conversation itself is handled by Retell.

## Goal

The demo shows one loop end to end: the AI caller phones a person (or the person calls it), they role-play a front desk call, hang up, and see a graded scorecard on a web page within about 15 seconds.

The product is an AI trainer for medical spa front desk staff. Retell AI hosts the voice agent, which is already built and working. It plays "Jessica", a caller who asks about Botox pricing and pushes for a discount. The trainee plays the receptionist and answers the phone, as they would at work. This repo builds everything around the call.

The demo runs like this:

1. The live page is open on a laptop. It shows a "We'll call you" phone number field, with "or call this number" below it.
2. The presenter (or the owner) enters a cell number and presses the button. The page shows "Calling you now".
3. The phone rings. The trainee answers as the front desk. The page switches to "Call in progress".
4. The trainee hangs up. The page switches to "Scoring your call".
5. The scorecard appears on its own, with no refresh.

Dialing the Retell number directly remains the fallback, for example if the trainee's phone silences unknown callers or flags the call as spam.

The audience is a medspa owner who is not technical. The scorecard page is the product as far as she can see, so it gets the polish.

## Scope

Build the call-start route, the transcript-to-scorecard pipeline, and three pages, and nothing else.

**In scope**

- A route that starts an outbound practice call to a number entered on the live page, using Retell's create-phone-call API.
- A webhook endpoint that receives call events from Retell.
- A scoring function that turns a transcript into a structured scorecard using an LLM.
- One database table for calls and their scorecards.
- A live page, a call history page, and a scorecard page.
- Scenario config (rubric, spa facts) stored as files in the repo.
- Command-line scripts: one that scores saved transcripts for tuning the prompt, one that re-scores a stored call, and one that replays a saved transcript through the live pipeline as a demo fallback.
- A single shared password in front of the pages.

**Out of scope**

- User accounts and knowing which employee made a call.
- Uploading SOPs and generating rubrics from them.
- A manager dashboard or sales stats.
- Creating or editing the Retell agent through its API. The agent is managed in Retell's dashboard.
- Retell's built-in post-call analysis. Ignore the `call_analyzed` event.
- Browser-based calls. The demo uses a phone number.

**Design for later without building it**

These cost almost nothing now and avoid a rewrite:

- Every row carries an `org_id`, defaulting to `demo`.
- Scenarios are config, so adding one means adding a folder.
- Scoring sits behind one function with a typed input and output.

Practice calls contain no patient data. Do not add features that record or import real patient calls.

## Architecture and stack

Retell handles the call. This app receives the result, scores it, stores it, and displays it.

1. The trainee enters their number on the live page. The app asks Retell to place an outbound call and creates a call row with status `dialing`. (Or the trainee dials the Retell number, in which case there is no `dialing` step.)
2. The trainee answers. Retell posts `call_started` to the webhook. The app sets the row to `in_progress`, or creates it for an inbound call.
3. The call ends. Retell posts `call_ended` with the full transcript.
4. The app saves the transcript, sets status `scoring`, and returns a 2xx response right away.
5. After responding, the app runs the scoring function and saves the scorecard with status `scored`.
6. The live page polls every 2 seconds and renders whatever state the newest call since page load is in.

**Stack**

| Layer | Choice | Notes |
| --- | --- | --- |
| App | Next.js, App Router, TypeScript | One repo for API routes and pages |
| Hosting | Vercel | Needs a public URL for the Retell webhook |
| Database | Supabase Postgres | Accessed server-side only, with the secret API key (`sb_secret_...`). Do not use the legacy `service_role` JWT, which Supabase is deprecating. |
| Scoring model | Anthropic API, official TypeScript SDK | Model ID comes from an env var. Uses structured outputs. |
| Retell | `retell-sdk` | Provides `Retell.verify` for webhooks and `call.createPhoneCall` for outbound calls |
| Validation | zod | Source of the output JSON schema and the semantic checks |
| Styling | Tailwind CSS |  |

**Environment variables**

| Name | Purpose |
| --- | --- |
| `RETELL_API_KEY` | Verifies webhook signatures and places outbound calls. Must be the key with the webhook badge in Retell's dashboard. |
| `ANTHROPIC_API_KEY` | Scoring calls |
| `SCORING_MODEL` | Model ID for scoring. Default to `claude-sonnet-5-5` and confirm the ID against Anthropic's current model list. |
| `SUPABASE_URL` | Database |
| `SUPABASE_SECRET_KEY` | Database, server-side only. The `sb_secret_...` key, passed to `createClient` where the service role key used to go. Never expose it to the browser. |
| `DEMO_PASSWORD` | Shared password for the pages |
| `NEXT_PUBLIC_DEMO_PHONE_NUMBER` | The Retell number in E.164 format (for example `+14155550123`). Used as `from_number` for outbound calls, and shown on the live page for inbound calls, formatted for display in code (for example `(415) 555-0123`). It is public on purpose: the page displays it. |

Commit a `.env.example` with these names and no values.

## Data model

One table holds everything. Put this in a migration file in the repo.

```sql
create table calls (
  id                   uuid primary key default gen_random_uuid(),
  org_id               text not null default 'demo',
  retell_call_id       text not null unique,
  retell_agent_id      text,
  scenario_id          text not null,
  call_type            text,
  direction            text,
  from_number          text,
  to_number            text,
  status               text not null,
  started_at           timestamptz,
  ended_at             timestamptz,
  duration_ms          integer,
  disconnection_reason text,
  transcript           text,
  transcript_object    jsonb,
  scorecard            jsonb,
  passed               integer,
  applicable           integer,
  scoring_model        text,
  scoring_latency_ms   integer,
  scoring_error        text,
  raw_payload          jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index calls_org_created_idx on calls (org_id, created_at desc);

alter table calls enable row level security;

-- The Supabase project does not auto-expose new tables to the Data API,
-- so grant the server's role explicitly. anon and authenticated get nothing.
grant select, insert, update on calls to service_role;
```

Row level security is enabled with no policies on purpose. The browser never talks to Supabase. All reads and writes go through server code using the secret key, which runs as the `service_role` Postgres role and bypasses RLS. That is why the grant above targets `service_role`.

Every update sets `updated_at = now()`. The stale-scoring rule below depends on it.

**Status values**

| Status | Meaning |
| --- | --- |
| `dialing` | Outbound call requested from Retell, not yet answered |
| `in_progress` | `call_started` received, call still going |
| `scoring` | Transcript saved, scoring running |
| `scored` | Scorecard saved |
| `too_short` | Call ended without enough conversation to grade |
| `no_answer` | Outbound call ended without a conversation: not answered, busy, voicemail, or the dial failed |
| `failed` | Scoring failed twice. `scoring_error` holds the reason. |

**Stale calls**

Three states can get stuck, and the API routes handle them at read time without changing the stored row:

- **Stuck in `dialing`:** if Retell never sends `call_started` or `call_ended` for an outbound call, the row stays `dialing`. A row in `dialing` whose `updated_at` is more than 2 minutes old is returned as `no_answer`.
- **Stuck in `scoring`:** if scoring is killed after the response (timeout, crash, frozen function), nothing moves the row out of `scoring`. A row in `scoring` whose `updated_at` is more than 60 seconds old is returned as `failed` with `scoring_error` "Scoring timed out". `npm run rescore` (see Scoring) recovers it.
- **Stuck in `in_progress`:** if Retell's `call_ended` never arrives, the row stays `in_progress`. A row in `in_progress` whose `updated_at` is more than 15 minutes old is returned as `failed` with `scoring_error` "Call result never arrived".

A call is **active** when it is `dialing`, `in_progress`, or `scoring` and not stale under these rules.

**Field notes**

- `passed` and `applicable` are computed in code from the scorecard, so the list page can show "4 / 6" without parsing JSON.
- `raw_payload` stores the last webhook body for debugging, with `call.from_number` and `call.to_number` replaced by their masked values. Never return it from an API route.
- Retell timestamps are Unix milliseconds. Convert them before saving.
- `call_type` holds Retell's value (for example `phone_call`), or `replay` for rows created by `demo:replay`. `direction` holds Retell's `inbound` or `outbound`.
- Phone numbers are masked to their last four digits (for example `•••• 1947`) **before saving**, in `from_number`, `to_number`, and `raw_payload`. The full number the trainee enters is used only in the request to Retell and is never stored or logged. On an outbound call, the trainee's number is `to_number`; on an inbound call, it is `from_number`.

## Retell webhook

The endpoint is `POST /api/webhooks/retell`. It must verify the request, save it, and respond fast, because Retell retries when it doesn't get a 2xx within 10 seconds.

These facts come from [Retell's webhook docs](https://docs.retellai.com/features/webhook-overview.md), checked on Nov 13, 2026:

- The body is JSON with an `event` string and a `call` object.
- Voice agents send `call_started`, `call_ended`, and `call_analyzed` by default.
- The `call_ended` payload includes `call_id`, `agent_id`, `call_type`, `from_number`, `start_timestamp`, `end_timestamp`, `disconnection_reason`, `transcript`, and `transcript_object`.
- The signature arrives in the `x-retell-signature` header.
- Retell retries up to 3 times, so the same event can arrive more than once.
- Retell expects a 2xx status and no response body.

**Handler steps**

1. Read the raw body as text. Verify against the raw text, not re-serialized JSON, or the signature check will fail.
2. Verify with `Retell.verify(rawBody, process.env.RETELL_API_KEY, signature)`. Return 401 if the header is missing or the check fails.
3. Parse the body and branch on `event`.
4. Return 204.

**On `call_started`**

Insert a row with status `in_progress`, the scenario matched from `agent_id`, `started_at`, `direction`, and the masked `from_number` and `to_number` from the payload. If the row already exists (an outbound call created by the call-start route), set `in_progress` and `started_at` only where status is `dialing`, and fill `direction`, `from_number`, and `to_number` if they are empty. Otherwise do nothing.

Every webhook write fills `direction` and the masked numbers from the payload, so they are saved even when the webhook creates the row before the call-start route does.

**On `call_ended`**

1. Upsert the row by `retell_call_id` with the transcript, transcript object, timestamps, duration, disconnection reason, `direction`, and the masked `from_number` and `to_number`. The row may not exist if `call_started` was missed, so a new row is inserted with status `in_progress`. On conflict, never write `status`: a duplicate delivery must not reset a call that is already `scoring` or `scored`.
2. If the call never connected, set status `no_answer` only where status is `dialing` or `in_progress`, and stop. Decide this from `disconnection_reason`, using the codes Retell documents for no answer, busy, voicemail, and dial failures. Map the exact codes from the current docs, not from memory.
3. If the call is too short to grade, set status `too_short` only where status is `dialing` or `in_progress`, and stop.
4. Otherwise claim the call for scoring with one atomic update that sets status `scoring` only where status is `dialing` or `in_progress`. If no row was updated, another delivery already claimed it, so stop.
5. Schedule scoring to run after the response is sent.

A call is too short when any of these is true: the transcript is empty, the call lasted under 20 seconds, or the trainee spoke fewer than 2 turns.

Count turns from `transcript_object`, not the transcript string. Merge consecutive entries from the same speaker into one turn first. Real transcripts contain back-to-back `user` lines (for example "Yes. Absolutely." followed by "Tuesday afternoon, I have…") that are one turn.

**On any other event**

Ignore it and return 204.

**Running scoring after the response**

Scoring takes several seconds, so it cannot run before the response. On Vercel, a function can be frozen once it responds, so a bare un-awaited promise is not reliable. Use the platform's supported mechanism for post-response work, such as `after()` from `next/server` or `waitUntil` from `@vercel/functions`. Check the current Next.js docs for which applies. Set the route's max duration to 60 seconds.

**Matching a scenario**

Each scenario config lists the Retell agent IDs that use it. Match on `call.agent_id`. If nothing matches, use the default scenario and log a warning. The demo has one scenario, so this is a small lookup.

## Scoring

Scoring is one function, `scoreCall(transcript, scenario)`, that returns a validated scorecard or throws. The webhook and all command-line scripts call it.

**File layout**

```text
scenarios/
  scoring-prompt.md            shared prompt template
  price-shopper/
    scenario.json              id, name, agent IDs, description, spa facts, rubric
    caller-prompt.md           copy of the prompt used in Retell, for reference only
fixtures/
  good_botox_1.txt             saved transcripts for tuning
  good_botox_2.txt
  medium_botox_1.txt
  medium_botox_2.txt
  bad_botox_1.txt
  expected.json                expected result per criterion, per fixture
  retell-call-ended.json             real inbound call_ended payload, captured in step 3
  retell-call-ended-outbound.json    real answered outbound payload, captured in step 5
  retell-call-ended-no-answer.json   real unanswered outbound payload, captured in step 5
```

The five transcripts are already in the project owner's `sample_transcripts/` folder. Move them into `fixtures/` unchanged.

The appendix has the full contents of `scoring-prompt.md` and `scenario.json`. `scenarios/price-shopper/caller-prompt.md` is already in the repo; keep it unchanged. Nothing in the code reads it. It lives in the repo so the scenario's two halves are versioned together.

The fixture transcripts were recorded with an earlier version of the caller prompt. In them Jessica sometimes suggests days herself or declines to give her number; the current prompt forbids both. The grader only judges the employee, so they remain valid fixtures for tuning the grader. Don't change them.

**Steps inside `scoreCall`**

1. Build the prompt by filling the template's placeholders from the scenario and the transcript.
2. Call the Anthropic API with the model from `SCORING_MODEL`, temperature 0, a max of about 2,000 output tokens, and structured outputs (`output_config.format`) using a JSON schema generated from the zod scorecard schema. Check the current SDK docs for the exact parameter shape.
3. Check the response for a refusal or a `max_tokens` stop before parsing. Treat either as a validation failure.
4. Parse the JSON and run the zod validation, including the semantic rules below that a JSON schema can't express.
5. Compute `passed` and `applicable` from the criteria. Do not ask the model for a score.
6. On a parse or validation failure, retry once and include the error in the retry. On a second failure, throw.
7. Return the scorecard with the model ID and the total latency in milliseconds.

API errors (429, 529, network) are handled by the SDK's built-in retries, not by step 6. Set the SDK timeout so that the worst case (SDK retries plus one validation retry) finishes within the route's 60-second max duration.

When `scoreCall` throws, the caller sets status `failed` and saves the message in `scoring_error`.

**Validation rules**

- `criteria` has exactly one entry per rubric item, in rubric order, with matching ids.
- `result` is `pass`, `fail`, or `not_applicable`.
- `quote` and `say_instead` are a string or null. `feedback` is a non-empty string.
- `best_moment` and `top_fix` are non-empty strings.
- `applicable` is the count of criteria that are not `not_applicable`. `passed` is the count of `pass`.

**Quote check**

For each non-null quote, check that it appears in the transcript after lowercasing and removing punctuation and extra whitespace. If it doesn't, keep the scorecard but log a warning with the call id. This catches invented quotes during tuning without failing a live demo. Expect some false warnings where the model removed stutters such as "we we don't". These are warnings only.

**Transcript format**

Retell's `transcript` field is a plain string with one line per turn, prefixed by `agent: ` or `user: `. The agent is the AI caller and the user is the trainee. The sample transcripts confirm these prefixes. Confirm them against `fixtures/retell-call-ended.json` once it is captured.

The caller prompt tells the agent to output exactly `NO_RESPONSE_NEEDED` when the trainee asks her to hold. Before scoring, counting turns, or displaying a transcript, remove any agent line or `transcript_object` entry whose content is exactly that token, so the grader never sees it and the trainee never sees it on the scorecard. Check the captured payloads to see whether Retell already drops it; if it never appears, note that in the README and keep the filter anyway. Otherwise pass the transcript to the model unchanged.

**Command-line scripts**

- `npm run score -- fixtures/good_botox_1.txt` prints the scorecard and latency for one transcript.
- `npm run score:fixtures` scores all five fixtures and compares each criterion to `fixtures/expected.json`. For every mismatch it prints the fixture, the criterion id, the expected and actual result, and the model's feedback. It exits non-zero only when a criterion mismatches. It also prints each call's latency and the median, with a warning on any call over 12 seconds; latency alone never fails the run, so one slow API response can't make the check flaky.
- `npm run rescore -- <call_id>` loads a stored call, runs `scoreCall`, and saves the result with status `scored` or `failed`. Use it for calls stuck in `scoring` or after prompt changes.
- `npm run demo:replay -- <fixture>` (for example `good_botox_2`) is the live-demo fallback. It inserts a row with a generated `retell_call_id`, `call_type` `replay`, and status `in_progress`; waits about 3 seconds so the live page shows "Call in progress"; saves the transcript; claims it for scoring; and runs `scoreCall`, the same way the webhook does. It calls the pipeline functions directly, not through the webhook. Share the claim-and-score code with the webhook handler so the two paths can't drift apart.

If the median latency is over 12 seconds, stop and report the measured latencies. The project owner will decide whether to trim the output or change the model.

`demo:replay` shows a recorded transcript as if it were a live call. Whoever presents must tell the room it is a recorded call. To back that up, the live page shows a small "Recorded call" tag on every state of a `replay` call.

**Expected results**

`fixtures/expected.json` maps each fixture to a result per criterion id. Use this content:

| Fixture | greeting | discovery | accurate_info | held_price | value | offered_time | booked | confirmed | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| good_botox_1 | pass | pass | fail | pass | pass | pass | pass | pass | 7 / 8 |
| good_botox_2 | pass | pass | pass | pass | pass | pass | pass | pass | 8 / 8 |
| medium_botox_1 | pass | fail | pass | pass | fail | fail | fail | not_applicable | 3 / 7 |
| medium_botox_2 | pass | fail | pass | pass | pass | pass | pass | fail | 6 / 8 |
| bad_botox_1 | fail | fail | fail | fail | fail | fail | fail | not_applicable | 0 / 7 |

Why the less obvious labels are set this way:

- good_botox_1 `accurate_info` fails because it quotes the membership at $100 a month, not $50.
- medium_botox_2 `value` passes: "ten years of experience, licensed nurse practitioner" is specific, even though it came only after a second push.
- bad_botox_1 `accurate_info` fails: "thirteen dollars a unit, I think" plus a 10% discount offer contradicts the stated policy.

## API routes and pages

One route starts calls, and three read-only routes feed three pages. The scorecard is one shared component used by the live page and the detail page. Every read route applies the stale-call rules before returning a call.

**Routes**

| Route | Returns |
| --- | --- |
| `POST /api/calls/start` with `{ "phone": "..." }` | Starts an outbound practice call. See below. |
| `GET /api/calls/latest?since=<ISO timestamp>` | The most recent call that is either created at or after `since`, or active (whatever its age). Null if there is none. Without `since`, the most recent call. |
| `GET /api/calls?limit=20` | Recent calls, newest first, without transcripts |
| `GET /api/calls/[id]` | One call with transcript and scorecard |

No route returns `raw_payload`. Phone numbers are already masked in the database.

**Starting an outbound call**

`POST /api/calls/start` does this, in order:

1. Normalize the entered number to E.164. Accept only US numbers (`+1` and 10 digits); Retell numbers can only call US destinations. Otherwise return 400 "Enter a US phone number".
2. If any call is active, return 409 "A call is already in progress". One call at a time. This check and the insert in step 5 aren't atomic; the idempotency key in step 4 and the disabled button cover double-clicks. Two people pressing at once from different devices is an accepted risk for the demo.
3. If 10 or more outbound calls were created in the last hour, return 429 "Too many calls. Try again later".
4. Call Retell's `createPhoneCall` with `from_number` set to `NEXT_PUBLIC_DEMO_PHONE_NUMBER`, `to_number` set to the normalized number, `override_agent_id` set to the default scenario's first agent ID, and `idempotency_key` set to the key from the request body. The number's outbound agent is also set to Jessica in Retell's dashboard; the override keeps the scenario config in charge either way.
5. Insert a row with Retell's `call_id`, status `dialing`, direction `outbound`, the masked `to_number`, and the scenario. If the webhook has already created the row, do nothing.
6. Return 201 with the call's id. If Retell rejects the request, return 502 with a short message and create no row.

The request body is `{ "phone": "...", "idempotencyKey": "..." }`. The page generates a new key (for example `crypto.randomUUID()`) when the trainee presses "Call me", and reuses it if the same submission is retried. Retell won't place a second call for a repeated key within an hour.

The route is behind the demo password like every other page and route.

**Live page at `/`**

This is the demo screen. When it loads, it records the current time and shows the idle state, unless a call is active. It polls `/api/calls/latest?since=<load time>` every 2 seconds and renders by status. Because active calls are returned whatever their age, an accidental refresh during a call or while scoring comes straight back to that call. Once the page picks up a call, it keeps showing that call until a newer one appears. Read the load time from the server's clock (for example from the first response) so laptop clock drift can't hide a call.

| State | What it shows |
| --- | --- |
| No calls since page load | A phone number field with a "Call me" button, under the heading "Enter your number and we'll call you". Directly under the field, in small type: "Enter your own number. We'll call it once for a practice call." Below that, smaller: "Or call" with the Retell number. The button is disabled from the moment it is pressed until the start route responds, and stays disabled while a call is active. Errors from the start route appear inline. |
| `dialing` | "Calling you now. Answer as the front desk." |
| `in_progress` | "Call in progress" with a subtle live indicator |
| `scoring` | "Scoring your call" with a progress indicator |
| `scored` | The scorecard, plus the "Call me" field and the phone number in a small footer for the next call |
| `too_short` | "That call was too short to score. Try again." with the "Call me" field |
| `no_answer` | "No answer. Check your phone and try again." with the "Call me" field |
| `failed` | "We couldn't score that call." with a link to the transcript when one exists |

When a new call starts, the page switches from the old scorecard to "Calling you now" or "Call in progress" on its own. The "Call me" field keeps the last entered number for the current page session only, so the trainee can call again without retyping. Don't store it anywhere else.

**History page at `/calls`**

A table of recent calls: date and time, scenario name, duration, score as "4 / 6", and status. Show "—" in the score column for `too_short`, `no_answer`, and `failed`. Label rows whose `call_type` is `replay` as "Replay". Each row links to the detail page.

**Detail page at `/calls/[id]`**

The scorecard, then the full transcript.

**Scorecard component**

In this order, top to bottom:

1. The score in large type, such as "4 / 6", with the scenario name, date, and call duration beside it.
2. A "Top fix" callout with the `top_fix` text. This is the one thing the trainee should remember.
3. A "Best moment" block with the `best_moment` text.
4. One row per criterion: the criterion's label, a pass, fail, or not-applicable badge, the quote styled as a quotation, the feedback sentence, and a "Try saying" line when `say_instead` is present.
5. The transcript, collapsed by default on the live page. Label the speakers "Caller" and "You", not "agent" and "user".

Criterion labels come from the scenario's rubric, not from the raw ids.

**Design notes**

- The page will be shown on a laptop to people standing a few feet away. Use large type and strong contrast for the score, the badges, and the top fix.
- Use color for pass and fail, and also a text label or icon, so it reads without color.
- It should also work on a phone screen.
- Keep it calm and professional. No charts, no confetti, no gamification.

**Password gate**

Add middleware that requires HTTP basic auth with `DEMO_PASSWORD` on every route except `/api/webhooks/retell`. The webhook is protected by its signature check.

## Build order

Build in six steps, and don't start a step until the previous one passes its check.

| Step | Build | Check before moving on |
| --- | --- | --- |
| 1 | Scaffold the app, the migration, and `.env.example` | The app runs locally and the `calls` table exists |
| 2 | Scenario config, `scoreCall`, `score`, and `score:fixtures` | `npm run score:fixtures` matches every expected label, and the median latency is 12 seconds or less |
| 3 | Webhook endpoint with signature check and row writes, no scoring yet | A real call through a tunnel creates one row. Replaying the same payload creates no second row and doesn't change the status. |
| 4 | Wire scoring to run after the response, plus `rescore` | A real call moves through `in_progress`, `scoring`, and `scored` |
| 5 | Call-start route, read routes, the three pages, the password gate, and `demo:replay` | The live page opens on the idle state despite earlier calls. "Call me" rings a real phone, Jessica stays silent until the trainee answers and greets her, and the page goes through `dialing`, `in_progress`, `scoring`, and `scored` with no refresh. An unanswered call that goes to voicemail ends in `no_answer`, not `too_short`. A double-click on "Call me" places one call. An inbound call and `demo:replay` also drive the page. |
| 6 | Deploy to Vercel and point the Retell agent's webhook at production | Three real calls (at least two outbound) score correctly, each within 15 seconds of hangup. `demo:replay` against production drives the live page end to end. |

In step 3, log one real inbound `call_ended` payload and save it as `fixtures/retell-call-ended.json`. In step 5, also save an answered outbound one as `fixtures/retell-call-ended-outbound.json` and an unanswered outbound one (let it ring out to voicemail) as `fixtures/retell-call-ended-no-answer.json`. Mask the phone numbers in all three before committing them. Build and test against these files, not against the field list in this spec. The `no_answer` mapping test must use the real no-answer payload.

**Automated tests**

- Prompt building fills every placeholder.
- Scorecard validation accepts a good response and rejects a missing criterion, a wrong id, a wrong order, and a bad `result` value.
- `passed` and `applicable` are computed correctly, including `not_applicable`.
- The too-short rule covers an empty transcript, a short call, and a one-turn call. Consecutive same-speaker entries count as one turn.
- The webhook rejects a bad signature, and a repeated `call_ended` triggers scoring once. A `call_ended` delivered after the call is `scored` leaves the status `scored`. Mock the scoring function for this.
- A row in `scoring` with `updated_at` more than 60 seconds old is returned as `failed`. One updated less than 60 seconds ago is returned as `scoring`. The same applies to `in_progress` with a 15-minute window, and to `dialing` (returned as `no_answer`) with a 2-minute window.
- `/api/calls/latest?since=` returns an active call created before `since`, and does not return a stale or finished one.
- `call_started` for an existing `dialing` row moves it to `in_progress`. A `call_ended` with a no-answer `disconnection_reason` sets `no_answer` and never schedules scoring, tested with `fixtures/retell-call-ended-no-answer.json`.
- When the webhook creates the row before the call-start route, the row still ends up with `direction` `outbound` and the masked `to_number`.
- The call-start route rejects non-US and malformed numbers, returns 409 while a call is active, and returns 429 after 10 outbound calls in an hour. Mock the Retell client for this.
- Phone numbers are masked before saving, including inside `raw_payload`.
- The quote check ignores case, punctuation, and whitespace.

**Inputs the project owner provides**



- [x] Retell API key with the webhook badge
- [x] Retell agent ID and phone number (the number must allow outbound calls)
- [x] In Retell's dashboard, before step 5: the Jessica agent waits for the other side to speak first on outbound calls, and voicemail detection is on (set to hang up, not leave a message), if the plan includes it
- [x] Sign-off from Nate (compliance) on the consent line and on placing AI voice calls to numbers typed into the form
- [x] Anthropic API key
- [x] Supabase project URL and secret API key (`sb_secret_...`)
- [x] Five fixture transcripts (in `sample_transcripts/`)
- [x] A demo password

If a credential is missing, build and test everything that doesn't need it, then stop and say what is blocked. Do not invent placeholder credentials or mock the missing service in production code.

**Verify against current docs**

These details change between versions. Check each one before relying on this spec:

- The argument order of `Retell.verify` in the installed `retell-sdk` version.
- The supported way to run work after a response in the installed Next.js version on Vercel.
- The current Anthropic model ID, the SDK call shape, and the structured outputs parameter (`output_config.format`) and its supported JSON schema features.
- How to set a webhook URL on a Retell agent. Use an agent-level webhook so other agents on the account are not affected.
- The `createPhoneCall` request shape, and the `disconnection_reason` values that mean no answer, busy, voicemail, or dial failure.

**Handoff**

When done, write a `README.md` covering local setup, environment variables, how to run the fixture script, `rescore`, and `demo:replay`, how to deploy, and where to set the webhook URL in Retell. Include the latencies measured by `score:fixtures`, and a demo-day note: outbound calls from a new number may show as "Spam Likely" or be silenced on iPhones with "Silence Unknown Callers" on, so test on the presenter's phone beforehand and keep the inbound number as the fallback. List anything from this spec that was skipped or changed, and why.

## Appendix: scenario files

These two files are the scoring prompt, split into a shared template and per-scenario data. Use the wording as written. Compared with the Nov 13 version they add the `accurate_info` criterion and its top-fix rule, remove "warmly" from the greeting, clarify that the membership is not a discount, and relabel the appointment times as example openings for suggestions only. `accurate_info` fails only facts that contradict the spa facts or are hedged; details the spa facts don't cover are ignored until a real client's full price sheet is loaded.

**`scenarios/scoring-prompt.md`**

Placeholders are in double braces. Render `spa_facts` as a dashed list. Render `rubric` as a numbered list of `id: description`.

```text
You are grading a practice phone call for medical spa front desk training. The
"agent" in the transcript is an AI playing a prospective patient. The "user" is
the front desk employee being trained. Grade only the front desk employee.

Scenario: {{scenario_description}}

Spa facts:
{{spa_facts}}

Rubric:
{{rubric}}

Rules:
- Be strict. Pass only if the transcript clearly shows it. When in doubt, fail.
- For every criterion, quote the employee's exact words that justify the result.
  If they never did it, set the quote to null.
- Suggestions must be a specific sentence the employee could have said on this
  call, using details the caller actually mentioned and the spa facts above.
  No generic advice.
- Never write bracketed placeholders like [day] or [X]. Use the spa facts. If a
  detail is not in the spa facts, leave it out of the suggestion.
- If "booked" failed only because the employee never offered a time, set its
  say_instead to null. The offered_time suggestion already covers it.
- If "accurate_info" failed, top_fix must correct the wrong fact, because giving
  a caller wrong information is the most costly mistake on this call.
- Write feedback in plain, encouraging language addressed to the employee.
- Do not grade the caller.

Return only JSON in this format, with no other text. Include one entry per
rubric item, in rubric order, using the rubric ids exactly:
{
  "criteria": [
    {
      "id": "greeting",
      "result": "pass" | "fail" | "not_applicable",
      "quote": "exact words from the transcript, or null",
      "feedback": "one sentence on what happened",
      "say_instead": "one sentence they could have said, or null if passed"
    }
  ],
  "best_moment": "the strongest thing the employee did, with a quote",
  "top_fix": "the single change that would most improve the next call"
}

Transcript:
{{transcript}}
```

**`scenarios/price-shopper/scenario.json`**

The spa facts are placeholders that match the test scripts. They will be replaced with a real client's details later. The consultation times are examples the grader can use in "Try saying" lines, which aren't allowed to contain placeholders. Trainees aren't given a schedule, so any specific day and time passes `offered_time`.

```json
{
  "id": "price-shopper",
  "name": "Botox price shopper",
  "isDefault": true,
  "retellAgentIds": ["REPLACE_WITH_RETELL_AGENT_ID"],
  "description": "A caller asks about Botox pricing, says a competitor is cheaper, and pushes for a discount.",
  "spaFacts": [
    "Spa name: Glow Medspa",
    "Botox price: $13 per unit. No discounts and no price matching.",
    "Consultations are free. The injector decides the number of units there.",
    "Injector: a licensed nurse practitioner with ten years of injecting experience.",
    "Membership: $50 a month, no contract, cancel anytime. Takes $1 off every unit and includes a monthly facial.",
    "Example open consultation times, for suggestions only: Thursday at 2 PM, Friday at 10 AM, Monday at 2:30 PM. The employee may offer any specific day and time."
  ],
  "rubric": [
    {
      "id": "greeting",
      "label": "Greeting",
      "description": "Opened by giving both the spa's name and their own name."
    },
    {
      "id": "discovery",
      "label": "Asked about her",
      "description": "Asked about the caller's goals, past experience, or timeline before or alongside quoting a price."
    },
    {
      "id": "accurate_info",
      "label": "Got the facts right",
      "description": "Every price, membership term, policy, or service detail the employee stated agrees with the spa facts. Fail any statement that contradicts the spa facts, and any hedged fact (such as \"I think\"). Ignore details the spa facts don't cover, such as hours, how long results last, or staff names. Appointment days and times do not count. If the employee stated no facts covered by the spa facts, mark not_applicable."
    },
    {
      "id": "held_price",
      "label": "Held the price",
      "description": "Did not offer or agree to a discount or price match when pushed. Offering the membership from the spa facts is not a discount. If the caller never pushed, mark not_applicable."
    },
    {
      "id": "value",
      "label": "Explained the value",
      "description": "Gave a specific reason the spa or provider is worth the price. Generic claims like \"we're really good\" do not count."
    },
    {
      "id": "offered_time",
      "label": "Offered a time",
      "description": "Proposed at least one specific appointment day and time. \"Let us know if you want to book\" does not count."
    },
    {
      "id": "booked",
      "label": "Got the booking",
      "description": "The caller agreed to a specific day and time for an appointment or consultation."
    },
    {
      "id": "confirmed",
      "label": "Confirmed the details",
      "description": "After the caller agreed to a time, the employee got her name and phone number and repeated the day and time back. If the caller never agreed to a time, mark not_applicable."
    }
  ]
}
```
