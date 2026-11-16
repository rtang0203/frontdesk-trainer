# Front Desk Trainer: Restyle Spec

Nov 16, 2026 · @Randy Tang

This spec is for a coding agent restyling the existing demo app. It changes how the app looks and leaves how it works alone: a white page with black text, a pale blue slip for the scorecard, a yellow highlight on the top fix, and green and red pass and fail marks.

## Goal and scope

Restyle every page of the demo to the look described here, with no change to behavior.

**What changes**

- Fonts, colors, borders, and spacing on every page.
- The scorecard becomes a single pale blue "slip" with hand-drawn pass and fail marks.
- The bulleted spa cheat sheet becomes a price list with dotted leader lines.
- The start page gains an "Incoming call" slip beside the phone number form.
- The blinking status dot gets a color per state.

**What must not change**

- Routes, API calls, polling, and the order and meaning of page states.
- The scoring prompt, the rubric, and the scorecard data shape.
- The single-column, centered layout of the three waiting states. Keep them as simple as they are now.
- The existing blink animation timing, if one is already defined.

The mockups live on a private design canvas the agent cannot open. The project owner will attach screenshots of the seven "Black and white version" artboards. Where a screenshot and this spec disagree, follow this spec.

## Design tokens

Define these once in the Tailwind theme or as CSS variables, and use the names everywhere. Do not scatter hex values through components.

**Colors**

| Token | Value | Used for |
| --- | --- | --- |
| `page` | `#FFFFFF` | Page background, input and box fills |
| `ink` | `#111111` | Text, borders, primary buttons |
| `muted` | `#555555` | Secondary text |
| `rule` | `#BDBDBD` | Row dividers on the white page |
| `leader` | `#8A8A8A` | Dotted leader lines, the scoring dot |
| `slip` | `#E1EBF7` | The slip background |
| `slip-rule` | `#9FB0C8` | Row dividers inside a slip |
| `highlight` | `#FFE867` | The top fix highlight only |
| `pass` | `#1E6B4A` | Pass ticks and labels |
| `fail` | `#B3261E` | Fail crosses and labels |
| `dot-calling` | `#3D7BD9` | Status dot while dialing |
| `dot-live` | `#E5372B` | Status dot during the call |

Green and red are reserved for pass and fail. Yellow is reserved for the top fix. Do not use any of the three for decoration.

**Type**

Load both families with `next/font/google`.

| Role | Family | Weight | Size and line height |
| --- | --- | --- | --- |
| Start page headline | Outfit | 700 | 58px / 1.02, letter spacing -0.02em |
| Waiting state headline | Outfit | 700 | 72px / 1.0, letter spacing -0.02em |
| Scorecard title | Outfit | 700 | 46px / 1.05, letter spacing -0.02em |
| Score | Outfit | 800 | 78px / 1.0, letter spacing -0.03em |
| Section heading | Outfit | 700 | 22 to 30px |
| Criterion label | Outfit | 700 | 23px |
| Body | DM Sans | 400 | 17px / 1.5 |
| Small text and field labels | DM Sans | 400 or 600 | 15px |
| Top fix | DM Sans | 600 | 25px / 1.5 |

On screens narrower than 640px, scale the three headline sizes to about 60% so they don't wrap awkwardly.

**Borders and corners**

- Structural borders are 2px `ink`: the header's bottom edge, inputs, tick boxes, the score box, and section heading underlines.
- Row dividers are 1px.
- Inputs and buttons have a 6px radius. Slips and boxes have a 4px radius.
- No shadows, no gradients, and no rotation on any element.
- Text labels use sentence case. Remove the existing all-caps labels such as "TOP FIX" and "SPA CHEAT SHEET".

## Shared elements

Build each of these once and reuse it.

**Header**

- "Front Desk Trainer" on the left in Outfit 700 at 23px. It links to the start page.
- "Call history" on the right in DM Sans 600 at 16px. On the history page this link reads "Practice a call" and goes to the start page.
- A 2px `ink` bottom border, 22px vertical padding, and 56px side padding. Use 20px side padding on phones.

**Primary button**

`ink` background, white text, DM Sans 600 at 19px, 56px tall, 30px side padding, no border. Disable it after a click, as it does now.

**Phone number field**

A visible label above the field ("Your mobile number", 15px, weight 600). The input is 56px tall with a 2px `ink` border, white fill, and 20px text. Inline errors from the start route appear under the field in `fail`.

**Price list**

This replaces the bulleted cheat sheet wherever it appears.

- A heading, "Price list", in Outfit 700 with a 2px `ink` underline.
- One row per item: the label on the left, the value in bold on the right, and a 2px dotted `leader` line filling the space between them.
- An optional note under each row in 15px `muted`.
- It sits directly on the page with no card, border, or background.

Build the row as a flex container with the leader as a flexible middle element, aligned to the text baseline. Hide the leader element from screen readers.

**Status dot**

A 22px circle centered above the headline on the three waiting states, using the existing blink animation. If none exists, pulse opacity between 1 and 0.2 over 1.2 seconds, and turn the animation off under `prefers-reduced-motion`.

| State | Dot color |
| --- | --- |
| Dialing | `dot-calling` |
| Call in progress | `dot-live` |
| Scoring | `leader` |

**Recorded call tag**

Keep the tag on replayed calls. Restyle it as a small bordered label: 1px `ink` border, 3px radius, 13px text, weight 600, sentence case ("Recorded call").

## Scenario data

The price list and the "Incoming call" slip need structured values, and `spaFacts` is a list of free-text sentences. Add two display-only fields to `scenarios/price-shopper/scenario.json`. Leave `spaFacts` and `rubric` exactly as they are, because the scoring prompt reads them.

```json
"brief": {
  "caller": "Jessica",
  "about": "Botox pricing",
  "role": "The front desk at Glow Medspa"
},
"priceList": [
  { "label": "Botox", "value": "$13 per unit", "note": "No discounts and no price matching." },
  { "label": "Consultation", "value": "Free", "note": "The injector decides the units there." },
  { "label": "Membership", "value": "$50 a month", "note": "No contract. $1 off every unit and a monthly facial." },
  { "label": "Injector", "value": "Nurse practitioner", "note": "Ten years of injecting experience." }
]
```

- The scoring code must not read `brief` or `priceList`.
- These repeat facts from `spaFacts`. Add a comment in the scenario's README, or a test, noting that the two must be edited together.
- If a scenario has no `priceList`, render nothing in its place.

## Pages

All pages use the `page` background with `ink` text, the shared header, and 52px top padding with 56px side padding in the main area.

**Start page (no call yet)**

Two columns that wrap to one on narrow screens.

- **Left column:** the headline "Enter your number and we'll call you", the phone field and "Call me" button, the line "Enter your own number. We'll call it once for a practice call." in `muted`, the line "Or call (773) 717-5067 yourself." with the number in bold, and the price list below.
- **Right column:** the "Incoming call" slip.

The "Incoming call" slip is a `slip` panel with 32px padding and no border:

1. A heading, "Incoming call", in Outfit 700 at 30px.
2. Four form-style rows with a `slip-rule` divider under each. The label is 14px weight 600 in a fixed 112px column, and the value is 18px. The rows are Caller, Calling about, and You are, filled from `brief`, then "How long" with the fixed text "Talk for at least 20 seconds, then hang up".
3. A sub-heading, "You'll be scored on".
4. The rubric labels in a two-column grid, each beside an empty 16px box with a 2px `ink` border and white fill. Read the labels from the scenario's rubric.
5. A closing line in 15px `muted`: "Your marked slip shows up here about 10 seconds after you hang up."

This slip replaces the current "How it works" card.

**Waiting states**

Keep the current centered, single-column layout. Each shows the status dot, a headline, and one line under it in 28px `muted`.

| State | Headline | Line under it | Price list below |
| --- | --- | --- | --- |
| Dialing | Calling you now. | Answer as the front desk. | Yes |
| Call in progress | Call in progress. | Hang up when you're done. | Yes |
| Scoring | Scoring your call. | This takes about 10 seconds. | No |

The price list sits about 96px below the message, centered, with a maximum width of 640px.

**Short-message states**

No answer, too short, and failed share one left-aligned layout with a maximum width of 640px: a 68px headline, one 22px sentence, an optional `muted` hint, then the phone field with the last number filled in and a "Call me again" button.

| State | Headline | Sentence |
| --- | --- | --- |
| No answer | No answer | We called the number ending in 0147 and nobody picked up. |
| Too short | Too short to score | That call ended before there was enough to grade. |
| Failed | We couldn't score that call | Something went wrong on our side. Your transcript is saved. |

- The no-answer hint reads: "Some phones silence unknown callers or mark them as spam. Check your recent calls for (773) 717-5067, then try again."
- The failed state links to the transcript when one exists.
- Use the real last four digits. For an inbound call that wasn't answered, drop the sentence about the number.

**Scored**

The scorecard slip from the next section, followed by a "Practice again" phone field and button, and the "Or call" line.

**Call history**

- A 58px headline, "Call history".
- A plain table on the page with no card: When, Scenario, Length, Score, Slip.
- The header row has a 2px `ink` underline, and body rows have 1px `rule` dividers.
- The score is in Outfit 700 at 24px, such as "4 / 7". For calls with no score, show the reason in `muted` ("No answer", "Too short to score", "Couldn't score").
- The last column links to the call ("Open slip"), or is empty when there is no scorecard.
- Replayed calls show the "Recorded call" tag after the scenario name.
- Wrap the table in a horizontally scrolling container for phones.

**Call detail**

The scorecard slip with the transcript expanded below it.

## Scorecard slip

The scorecard is one `slip` panel, not a stack of cards. It has a maximum width of 860px, a 4px radius, no border, and 40px by 44px padding (24px on phones). Top to bottom:

**1. Header row**

Two parts side by side, wrapping on narrow screens.

- **Left:** the title "Your call with Jessica", using the caller's name from `brief`. Under it are three form-style rows with `slip-rule` dividers: Scenario, When, and Length. Write the length in words, such as "3 minutes 42 seconds".
- **Right:** the score box. It has a white fill, a 2px `ink` border, and a 4px radius, with centered content: the label "Score" in 14px weight 600, the score such as "4 / 7" in the Score type style, and under it "4 passed" in `pass` and "3 failed" in `fail`, both 14px weight 700. Count failed as applicable minus passed.

If the call is a replay, show the "Recorded call" tag above the title.

**2. Top fix**

A small heading, "Top fix", in 15px weight 700. Then the `top_fix` text in the Top fix type style with a `highlight` background behind the text itself, like a highlighter stroke. Apply the background to an inline element with `box-decoration-break: clone` and about 3px by 6px padding, so each wrapped line is highlighted separately. It is not a full-width box, and it has no border.

**3. Best moment**

A small heading, "Best moment", then the `best_moment` text at 18px. A 2px `ink` rule closes this section.

**4. Criterion rows**

One row per rubric item, with a 1px `slip-rule` divider under each and 20px vertical padding.

- **Left:** a 30px box with a white fill, a 2px `ink` border, and a 4px radius, holding the mark.
- **Right, first line:** the rubric label in the Criterion label style, and the result word aligned to the far right in 16px weight 700.
- **Then:** the quote in italics when there is one, the feedback sentence, and when `say_instead` is present a line starting with a bold "Try saying:".

| Result | Mark in the box | Word | Color |
| --- | --- | --- | --- |
| Pass | Hand-drawn tick | Pass | `pass` |
| Fail | Hand-drawn cross | Fail | `fail` |
| Not applicable | Short dash | Didn't apply | `ink` |

The tick is drawn larger than its box so it overflows the top right corner, like a pen mark. Use these inline SVGs, positioned absolutely inside the box, with `aria-hidden` on the box. The result word carries the meaning for screen readers.

```html
<!-- Tick: 44px, offset left -3px, top -14px, overflow visible -->
<svg viewBox="0 0 40 40" width="44" height="44">
  <path d="M7 22c3 2.5 5.5 5.5 7.5 9.5C19 21 25 12.5 35 4" fill="none"
    stroke="#1E6B4A" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>

<!-- Cross: 38px, offset left -6px, top -6px, overflow visible -->
<svg viewBox="0 0 40 40" width="38" height="38">
  <path d="M8 9c8 6 15 13 24 22M31 8C23 15 15 23 8 32" fill="none"
    stroke="#B3261E" stroke-width="4.5" stroke-linecap="round"/>
</svg>

<!-- Dash: 26px, offset left 0, top 0 -->
<svg viewBox="0 0 30 30" width="26" height="26">
  <path d="M8 13h10" fill="none" stroke="#111111" stroke-width="3" stroke-linecap="round"/>
</svg>
```

**5. Transcript**

A "Read the full transcript" link in weight 600 that expands the transcript inside the slip. Keep the speaker labels "Caller" and "You". On the call detail page the transcript starts expanded.

**Optional reveal**

When a scorecard first appears on the live page, the marks may draw in one after another over about a second. Skip this under `prefers-reduced-motion`, and never animate on the detail or history pages. Leave it out if it adds risk before the client sees the demo.

## Checks before handing back

Work on a branch and open a pull request. Do not deploy to production, because the client may be looking at the live demo.

**Behavior is unchanged**

- [ ] The existing automated tests pass with no changes to their assertions, apart from text that this spec rewords.
- [ ] `npm run score:fixtures` gives the same results as before.
- [ ] `npm run demo:replay` drives the live page through in progress, scoring, and scored with no refresh.
- [ ] A real outbound call and a real inbound call both reach a scorecard.

**Every state looks right**

- [ ] Start page, dialing, call in progress, scoring, scored, no answer, too short, failed, call history, and call detail each match this spec.
- [ ] A scorecard with all passes, one with all fails, and one with a not-applicable row all render correctly.
- [ ] A top fix long enough to wrap onto three lines stays highlighted line by line.
- [ ] A replayed call shows the "Recorded call" tag on the live page, the scorecard, and in history.

**It holds up**

- [ ] At 390px wide, nothing scrolls sideways except the history table inside its own container.
- [ ] No hex colors remain in components. Every color comes from a token.
- [ ] No all-caps labels, shadows, gradients, or rotated elements remain.
- [ ] Every input has a visible label, and every button and link can be reached and used with the keyboard, with a visible focus outline.
- [ ] The status dot stops blinking when the system asks for reduced motion.

**Handoff**

In the pull request description, include a screenshot of each state at desktop and phone width, and list anything from this spec that was skipped or changed, with the reason.
