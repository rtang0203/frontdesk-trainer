# Front Desk Trainer: Demo Build Spec

Nov 13, 2026 · @Randy Tang

This spec is written for a coding agent building the demo from an empty repo. It covers everything after the phone call itself: receiving the transcript from Retell, scoring it with an LLM, and showing a scorecard on a web page.

## Goal

The demo shows one loop end to end: a person calls a phone number, role-plays a front desk call against an AI caller, hangs up, and sees a graded scorecard on a web page within about 15 seconds.

The product is an AI trainer for medical spa front desk staff. Retell AI hosts the voice agent, which is already built and working. It plays "Jessica", a caller who asks about Botox pricing and pushes for a discount. The trainee plays the receptionist. This repo builds everything that happens after the call.

The demo runs like this:

1. The live page is open on a laptop and shows the number to dial.
2. The presenter dials the Retell number on speaker. The page switches to "Call in progress".
3. The presenter hangs up. The page switches to "Scoring your call".
4. The scorecard appears on its own, with no refresh.

The audience is a medspa owner who is not technical. The scorecard page is the product as far as she can see, so it gets the polish.

## Scope

Build the transcript-to-scorecard pipeline and three pages, and nothing else.

**In scope**

- A webhook endpoint that receives call events from Retell.
- A scoring function that turns a transcript into a structured scorecard using an LLM.
- One database table for calls and their scorecards.
- A live page, a call history page, and a scorecard page.
- Scenario config (rubric, spa facts) stored as files in the repo.
- A command-line script that scores saved transcripts, for tuning the prompt.
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

1. A trainee dials the Retell phone number and talks to the AI caller.
2. Retell posts `call_started` to the webhook. The app creates a call row with status `in_progress`.
3. The call ends. Retell posts `call_ended` with the full transcript.
4. The app saves the transcript, sets status `scoring`, and returns a 2xx response right away.
5. After responding, the app runs the scoring function and saves the scorecard with status `scored`.
6. The live page polls every 2 seconds and renders whatever state the latest call is in.

**Stack**

| Layer | Choice | Notes |
| --- | --- | --- |
| App | Next.js, App Router, TypeScript | One repo for API routes and pages |
| Hosting | Vercel | Needs a public URL for the Retell webhook |
| Database | Supabase Postgres | Accessed server-side only, with the service role key |
| Scoring model | Anthropic API, official TypeScript SDK | Model ID comes from an env var |
| Webhook verification | `retell-sdk` | Provides `Retell.verify` |
| Validation | zod | Validates the model's JSON |
| Styling | Tailwind CSS |  |

**Environment variables**

| Name | Purpose |
| --- | --- |
| `RETELL_API_KEY` | Verifies webhook signatures. Must be the key with the webhook badge in Retell's dashboard. |
| `ANTHROPIC_API_KEY` | Scoring calls |
| `SCORING_MODEL` | Model ID for scoring. Default to `claude-sonnet-5-5` and confirm the ID against Anthropic's current model list. |
| `SUPABASE_URL` | Database |
| `SUPABASE_SERVICE_ROLE_KEY` | Database, server-side only. Never expose it to the browser. |
| `DEMO_PASSWORD` | Shared password for the pages |
| `NEXT_PUBLIC_DEMO_PHONE_NUMBER` | The number shown on the live page |

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
  from_number          text,
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
  scoring_error        text,
  raw_payload          jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index calls_org_created_idx on calls (org_id, created_at desc);

alter table calls enable row level security;
```

Row level security is enabled with no policies on purpose. The browser never talks to Supabase. All reads and writes go through server code using the service role key.

**Status values**

| Status | Meaning |
| --- | --- |
| `in_progress` | `call_started` received, call still going |
| `scoring` | Transcript saved, scoring running |
| `scored` | Scorecard saved |
| `too_short` | Call ended without enough conversation to grade |
| `failed` | Scoring failed twice. `scoring_error` holds the reason. |

**Field notes**

- `passed` and `applicable` are computed in code from the scorecard, so the list page can show "4 / 6" without parsing JSON.
- `raw_payload` stores the last webhook body for debugging. Never return it from an API route.
- Retell timestamps are Unix milliseconds. Convert them before saving.

## Retell webhook

The endpoint is `POST /api/webhooks/retell`. It must verify the request, save it, and respond fast, because Retell retries when it doesn't get a 2xx within 10 seconds.

These facts come from [Retell's webhook docs](https://docs.retellai.com/features/webhook-overview.md), checked on the date above:

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

Insert a row with status `in_progress`, the scenario matched from `agent_id`, and `started_at`. If a row with that `retell_call_id` already exists, do nothing.

**On `call_ended`**

1. Upsert the row by `retell_call_id` with the transcript, timestamps, duration, and disconnection reason. The row may not exist if `call_started` was missed.
2. If the call is too short to grade, set status `too_short` and stop.
3. Otherwise claim the call for scoring with one atomic update that sets status `scoring` only where status is `in_progress`. If no row was updated, another delivery already claimed it, so stop.
4. Schedule scoring to run after the response is sent.

A call is too short when any of these is true: the transcript is empty, the call lasted under 20 seconds, or the trainee spoke fewer than 2 turns.

**On any other event**

Ignore it and return 204.

**Running scoring after the response**

Scoring takes several seconds, so it cannot run before the response. On Vercel, a function can be frozen once it responds, so a bare un-awaited promise is not reliable. Use the platform's supported mechanism for post-response work, such as `after()` from `next/server` or `waitUntil` from `@vercel/functions`. Check the current Next.js docs for which applies. Set the route's max duration to 60 seconds.

**Matching a scenario**

Each scenario config lists the Retell agent IDs that use it. Match on `call.agent_id`. If nothing matches, use the default scenario and log a warning. The demo has one scenario, so this is a small lookup.

## Scoring

Scoring is one function, `scoreCall(transcript, scenario)`, that returns a validated scorecard or throws. The webhook and the command-line script both call it.

**File layout**

```text
scenarios/
  scoring-prompt.md            shared prompt template
  price-shopper/
    scenario.json              id, name, agent IDs, description, spa facts, rubric
    caller-prompt.md           copy of the prompt used in Retell, for reference only
fixtures/
  good.txt                     saved transcripts for tuning
  medium.txt
  bad.txt
```

The appendix has the full contents of `scoring-prompt.md` and `scenario.json`. Nothing in the code reads `caller-prompt.md`. It lives in the repo so the scenario's two halves are versioned together.

**Steps inside `scoreCall`**

1. Build the prompt by filling the template's placeholders from the scenario and the transcript.
2. Call the Anthropic API with the model from `SCORING_MODEL`, temperature 0, and a max of about 2,000 output tokens.
3. Pull the JSON out of the response. Strip code fences if the model added them.
4. Validate it with a zod schema.
5. Compute `passed` and `applicable` from the criteria. Do not ask the model for a score.
6. On a parse or validation failure, retry once and include the error in the retry. On a second failure, throw.

When `scoreCall` throws, the caller sets status `failed` and saves the message in `scoring_error`.

**Validation rules**

- `criteria` has exactly one entry per rubric item, in rubric order, with matching ids.
- `result` is `pass`, `fail`, or `not_applicable`.
- `quote` and `say_instead` are a string or null. `feedback` is a non-empty string.
- `best_moment` and `top_fix` are non-empty strings.
- `applicable` is the count of criteria that are not `not_applicable`. `passed` is the count of `pass`.

**Quote check**

For each non-null quote, check that it appears in the transcript after normalizing case and whitespace. If it doesn't, keep the scorecard but log a warning with the call id. This catches invented quotes during tuning without failing a live demo.

**Transcript format**

Retell's `transcript` field is a plain string with one line per turn, prefixed by speaker. The agent is the AI caller and the user is the trainee. Pass it to the model unchanged. Confirm the exact prefixes on a real payload before writing the turn counter for the too-short rule, or count turns from `transcript_object` instead.

**Command-line script**

- `npm run score -- fixtures/good.txt` prints the scorecard for one transcript.
- `npm run score:fixtures` scores all three and checks the results against the expected ranges below.

| Fixture | Expected |
| --- | --- |
| `good.txt` | At least 6 passed of 7 |
| `medium.txt` | 2 to 4 passed |
| `bad.txt` | 0 or 1 passed |

The three fixture transcripts come from real test calls and will be supplied by the project owner. If they are missing, build the script anyway and note it in the handoff.

## API routes and pages

Three read-only routes feed three pages. The scorecard is one shared component used by the live page and the detail page.

**Routes**

| Route | Returns |
| --- | --- |
| `GET /api/calls/latest` | The most recent call, or null |
| `GET /api/calls?limit=20` | Recent calls, newest first, without transcripts |
| `GET /api/calls/[id]` | One call with transcript and scorecard |

No route returns `raw_payload`. Mask `from_number` to its last four digits before returning it.

**Live page at `/`**

This is the demo screen. It polls `/api/calls/latest` every 2 seconds and renders by status.

| State | What it shows |
| --- | --- |
| No calls yet | "Call this number to start a practice call" with the phone number in large type |
| `in_progress` | "Call in progress" with a subtle live indicator |
| `scoring` | "Scoring your call" with a progress indicator |
| `scored` | The scorecard, plus the phone number in a small footer for the next call |
| `too_short` | "That call was too short to score. Call again to try." |
| `failed` | "We couldn't score that call." with a link to the transcript |

When a new call starts, the page switches from the old scorecard to "Call in progress" on its own.

**History page at `/calls`**

A table of recent calls: date and time, scenario name, duration, score as "4 / 6", and status. Each row links to the detail page.

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
| 2 | Scenario config, `scoreCall`, and the command-line script | `npm run score:fixtures` passes the expected ranges |
| 3 | Webhook endpoint with signature check and row writes, no scoring yet | A real call through a tunnel creates one row. Replaying the same payload creates no second row. |
| 4 | Wire scoring to run after the response | A real call moves through `in_progress`, `scoring`, and `scored` |
| 5 | API routes, the three pages, and the password gate | The live page changes state during a real call with no refresh |
| 6 | Deploy to Vercel and point the Retell agent's webhook at production | Three real calls score correctly, each within 15 seconds of hangup |

In step 3, log one real `call_ended` payload and save it as `fixtures/retell-call-ended.json`. Build and test against that file, not against the field list in this spec.

**Automated tests**

- Prompt building fills every placeholder.
- Scorecard validation accepts a good response and rejects a missing criterion, a wrong id, and a bad `result` value.
- `passed` and `applicable` are computed correctly, including `not_applicable`.
- The too-short rule covers an empty transcript, a short call, and a one-turn call.
- The webhook rejects a bad signature, and a repeated `call_ended` triggers scoring once. Mock the scoring function for this.

**Inputs the project owner provides**

- [ ] Retell API key with the webhook badge
- [ ] Retell agent ID and phone number
- [ ] Anthropic API key
- [ ] Supabase project URL and service role key
- [ ] Three fixture transcripts: good, medium, and bad
- [ ] A demo password

If a credential is missing, build and test everything that doesn't need it, then stop and say what is blocked. Do not invent placeholder credentials or mock the missing service in production code.

**Verify against current docs**

These details change between versions. Check each one before relying on this spec:

- The argument order of `Retell.verify` in the installed `retell-sdk` version.
- The supported way to run work after a response in the installed Next.js version on Vercel.
- The current Anthropic model ID and SDK call shape.
- How to set a webhook URL on a Retell agent. Use an agent-level webhook so other agents on the account are not affected.

**Handoff**

When done, write a `README.md` covering local setup, environment variables, how to run the fixture script, how to deploy, and where to set the webhook URL in Retell. List anything from this spec that was skipped or changed, and why.

## Appendix: scenario files

These two files are the tested scoring prompt, split into a shared template and per-scenario data. Use the wording as written. It has been tuned against real calls.

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

The spa facts are placeholders that match the test scripts. They will be replaced with a real client's details later.

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
    "Open consultation times: Thursday at 2 PM, Friday at 10 AM, Monday at 2:30 PM."
  ],
  "rubric": [
    {
      "id": "greeting",
      "label": "Greeting",
      "description": "Greeted warmly and gave both the spa's name and their own name."
    },
    {
      "id": "discovery",
      "label": "Asked about her",
      "description": "Asked about the caller's goals, past experience, or timeline before or alongside quoting a price."
    },
    {
      "id": "held_price",
      "label": "Held the price",
      "description": "Did not offer or agree to a discount or price match when pushed. If the caller never pushed, mark not_applicable."
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
