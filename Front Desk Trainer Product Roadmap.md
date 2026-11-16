# Front Desk Trainer: Product Roadmap

Nov 16, 2026 · @Randy Tang

The demo becomes a product in three versions: a pilot the first client's staff use every workday, a game layer that keeps them practicing, and a scoreboard that puts practice next to sales results.

## At a glance

&#91;embedded content: roadmap · 3 versions, 2 gates\]

Each version is built only after the one before it has passed its gate with the first client.

## V1: Pilot product

V1 turns the demo into something the first client's front desk can use every workday. The demo proves the call-and-scorecard loop, but it has no accounts, no idea who is calling, and a made-up spa.

**Goal:** the client's staff each complete their required practice calls for two weeks.

**What's in**

- **Accounts:** one organization per spa, an owner login, and a login for each front desk employee.
- **Calls tied to a person:** staff start a call from their own logged-in page, so every call and score belongs to an employee.
- **Her real scenarios:** the client's SOPs and price sheet turned into three to five scenarios and rubrics. Randy writes these by hand. There is no upload screen yet.
- **Staff home page:** today's required calls, past calls, and scorecards.
- **Owner page:** who practiced this week, each person's scores, and each person's weakest skills.
- **Stricter accuracy grading:** with her full price sheet loaded, any wrong price or policy fails.

**What's out**

SOP upload, levels and stars, sales stats, booking-software integrations, and the live call copilot.

**Proposed first scenarios**

These are a starting list to confirm with the client:

1. Botox price shopper (built)
2. Membership cancellation
3. Rebooking a client who hasn't been in for months
4. New caller who isn't sure what treatment they want
5. Client unhappy with a result

**Gate to V2**

- Staff complete at least 80% of their required calls over two weeks.
- The owner reads 10 scorecards and disagrees with no more than 2.

## V2: Game layer

V2 gives staff a sense of progress and a reason to try harder, so practice continues without the owner chasing them.

**Goal:** practice rates hold through the fourth week, when novelty has worn off.

**Progression**

- **Three levels per scenario.** Each level is the same caller made harder.
- **Stars.** One to three stars per level, based on the score.
- **Unlocks.** Clearing a level opens the next one. Clearing a scenario opens a new scenario.
- **Daily streak.** Counts consecutive workdays with the required calls done.
- **Skill bars.** Each rubric skill, such as asking questions, holding price, and closing, fills up across all scenarios.
- **Personal bests and a team goal.** No leaderboard. A front desk is two to five people, and ranking them gets personal.

**What makes a level harder**

One Retell agent per scenario, with these settings passed in on each call:

| Lever | Level 1 | Level 3 |
| --- | --- | --- |
| Price pushes | One | Three, with a competitor's promo |
| Guardedness | Shares details when asked | Needs follow-up questions |
| What it takes to book | One good move | Questions, value, and a specific time |
| Objections | Price only | Price plus a second one, such as "I need to ask my husband" |
| Curveballs | None | A medical question or a service the spa doesn't offer |
| On-screen support | Full script | Nothing |
| Grading | Three criteria | All criteria, higher pass mark |

Caller details such as her name, timeline, and objection change on every call, so nobody memorizes one script.

**Retry the moment**

After a scorecard, staff can replay just the part they fumbled in a 30-second drill. The caller repeats the one line that tripped them, and they answer it again. This is the feature most likely to make practice feel like a game, because the loop is short.

**Hints after a low score**

A low score offers a cheat sheet for that scenario before the next attempt. Using it caps that attempt at two stars.

**Rules that keep it fair**

- A level never changes what a criterion means, only how many are graded and how hard the caller is.
- The owner page shows the level each score was earned at.
- Stars come from the same scorecard staff already trust. There is no separate points system.

**Gate to V3**

- Staff complete at least 80% of required calls in week four.
- A healthcare attorney has reviewed the V3 data plan.

## V3: Scoreboard

V3 shows the owner each employee's real sales numbers next to their practice, which is how the product proves it is worth paying for. It is a scoreboard, not a general front desk hub.

**Goal:** the owner checks it weekly and uses it in staff conversations.

**What's in**

- **Weekly numbers per employee:** memberships sold, rebookings, and retail sales, as counts and dollar totals.
- **Simple entry:** a manager types the weekly totals or uploads a spreadsheet of totals exported from the booking software.
- **Side-by-side view:** each person's practice scores, level, and streak beside their sales numbers, with a trend over weeks.
- **Coaching notes:** short notes from the owner about an employee's progress.

**What's out**

- Patient names, appointment records, or anything about an individual client.
- General notes, task lists, or shift handoffs. The booking software and the spa's own tools cover these.
- A direct connection to the booking software. This comes later and only after legal review.

**Data rules**

These keep patient information out of the product, which keeps it clear of HIPAA obligations for as long as possible:

- Sales fields accept numbers only.
- Coaching notes are about staff, and the notes field carries a visible "no patient names" warning.
- Imports take totals per employee per week, never one row per client or appointment.
- The client's staff policy covers recording practice calls and tracking individual performance.

**One caution on what the numbers show**

With two to five staff, sales move for many reasons besides practice. Present the scoreboard as practice and results side by side, and don't claim one caused the other until there is data from several spas.

**Later, not scheduled**

SOP upload with generated scenarios, booking-software integration, scoring of real recorded calls, and the live call copilot. Each of the last three brings patient data in, so each needs its own compliance work first.

## Open decisions

- **Order of V2 and V3.** The game layer is second because it needs no patient data, builds on what exists, and produces the practice history the scoreboard displays. Swap them if the pilot client asks for sales stats first.
- **Pilot price.** What the first client pays per location per month, and whether the pilot is discounted.
- **Scenario list.** Which three to five scenarios matter most to her.
- **When to build SOP upload.** Hand-writing scenarios works for one or two clients. It becomes the bottleneck after that.
- **Daily requirement.** One call or two per workday, and what counts as done: any scored call, or a minimum score.

## Next steps

- [ ] Nate sends the demo and collects the client's reaction
- [ ] Get her SOPs, price sheet, and the call types her staff handle worst
- [ ] Agree on a pilot price and start date
- [ ] Write the V1 build spec
- [ ] Draft the next two scenarios from her SOPs
