# Tracker data entry — investigation and proposed flows

Date: 2026-08-11
Code inspected: `main` at `e2bb035`, running at `http://127.0.0.1:4173`

This continues [the source-pass re-audit](../tracker-entry-rethink-2026-08-11/README.md) rather than replacing it.
That document established the right *unit of work* (a source-screen pass, not a row) and the right *ownership rules*
(one canonical ledger; sessions and imports propose). It stopped short of three things, which is what this document
adds:

1. a **measured** account of what the app does today, per tracker;
2. a **journey map per tracker**, because the seven do not want the same input method;
3. a **derivation ledger** — quantified — of what the app asks the player to type that it could get for free.

No code was changed.

---

## Verdict

The app asks for roughly **2,265 primary values** to establish a baseline (833 kills + 316 boss kills + 25 charm
stages + 570 + 237 + 113 + 171 yes/no marks), and its entry model is a paginated database table in all seven cases.
Three problems compound:

- **It asks for numbers Tibia does not show.** Bosstiary asks for an exact kill count per boss; the client shows a
  *stage*. For the 109 Nemesis bosses the entire truth is "0, 1, 3 or 5". The app demands precision the source
  cannot supply, so the player either guesses or leaves it empty — and a guess is worse than a stage.
- **It asks for information it already has.** The clearest single artefact in the whole audit: a processed session
  row reads `Session Kills 412 · Total Kills [ ] · Kills Remaining 500`. The app parsed 412 kills, printed them,
  told the player 500 remain, and then asked them to type the total by hand.
- **It cannot tell "unknown" from "zero".** 833 empty kill fields and 570 "No" marks are indistinguishable from
  confirmed facts, so the headline (`1 / 833 complete`, `5 charm points`) is not a statement about the character —
  it is a statement about how much transcription has happened. Nothing in the UI says which.

The fix is not a faster table. It is to **eliminate** what can be derived, **automate** what can be parsed or
checked, and **simplify** only what is genuinely left — the EAS order from NN/g, applied in that order.

---

## 1. The product and the real workflow

The product is a character progress ledger that mirrors Tibia's character-owned Cyclopedia state and turns it into
planning information (Charm Plan, Opportunities, Task estimates). The player's real loop is:

> read one bounded screen in the Tibia client → transcribe it → play → come back with new evidence

The client is the only source of truth, it is a separate window, and it cannot export. Everything else follows from
that: the app's job is to make transcription short, resumable, and trustworthy — and to avoid asking at all wherever
possible.

Two workloads that the current UI does not distinguish:

| Workload | Frequency | Volume | Needs |
| --- | --- | --- | --- |
| **Baseline** — first setup, or re-verifying a tracker | Once, then rarely | Hundreds of items | Bounded passes, resumability, "unknown" as a real state, a completion checkpoint |
| **Upkeep** — one thing changed since yesterday | Every session | 1–5 items | One search box, one field, before → after, undo |

Today both funnel into the same 14-page table.

---

## 2. What the app does today (measured)

Measured in-browser at 1440×900 unless stated.

| Tracker | Items | Pages @60 | Primary input | Entry control | Pass unit available as a facet |
| --- | --- | --- | --- | --- | --- |
| Achievements | 570 | 10 | `done` | Yes/No button | Category (18) |
| Bestiary | 833 | 14 | `kills` (number) + Echo Warden flag | number field + Yes/No button | Class (21 values) |
| Bosstiary | 316 | 6 | `kills` (number) | number field | Category (3) |
| Charms | 25 | 1 | `stage` 0–3 | **number field** | Type (Major/Minor) |
| Measuring Tibia | 171 | 3 | `discovered` | Yes/No button | Area (20) |
| Quests | 237 | 4 | `completed` | Yes/No button | Questlog (94) |
| Titles | 113 | 2 | `earned` | Yes/No button | Permanent / Losable |

### Shared mechanics, as they actually behave

- **Autosave** is immediate and silent: a counter commits on blur, a flag on click, then `persistState()`. There is
  **no undo anywhere in the app** — `grep` finds four `window.confirm` calls and zero undo paths.
- **Counter entry is fine.** Tab-through works (type into Azure Frog → Tab → focus lands on Bog Frog), commit
  costs ~5 ms. This was fixed since the previous audit and should not be re-litigated.
- **Boolean entry loses focus on every mark.** Clicking any Yes/No toggle re-renders the table (~13–17 ms, fast
  enough) and leaves `document.activeElement === document.body`. A keyboard user must re-tab from the top of the
  document after *every* mark, across 1,091 boolean items. This is the single worst mechanic in the app.
- **Marking an item can make its row vanish.** The natural way to work is the `Missing` tab; marking an item earned
  removes it from the filtered set, so the rows below shift up under the pointer between clicks.
- **Import replaces, without a diff.** One `window.confirm` naming a count ("Replace your saved Achievements
  progress (312 entries) with 570 rows from this file?"), then the whole record is overwritten. No field-level
  comparison, no unmatched-name report before committing, no undo.
- **The primary control clips below ~1190 px.** At an 850 px viewport the 256 px sidebar leaves a 496 px table for
  860 px of columns, and `Earned` / `Discovered` — the only control that matters — sits at x≈852, entirely behind
  horizontal scroll. At 1440 px there is no overflow.

### Inconsistencies found

- **Bosstiary, Charms and Titles render two segmented facets into one tab strip**, producing two buttons both
  labelled `All`: `All · Bane · Archfoe · Nemesis · All · Not Started · In Progress · Mastered`.
- **Bestiary's column order differs from the other six** (bookmark star moved to last; the others lead with it).
- **`animusMastery` has no UI at all.** It is in `entryDefaults` and in the exported CSV columns, but no column
  renders a control for it on `main` — a field that can be imported and exported but never seen or edited.
- **Charms types a 0–3 enum into a number field**, where the value space is four discrete stages.

---

## 3. Research

### How Tibia presents the source information

From the official game guide's interface manual and TibiaWiki:

| Client surface | What the player can actually read | Grouping |
| --- | --- | --- |
| Achievements | Which achievements the character has, with grade and points. Secret ones stay hidden until earned | Category |
| Bestiary | Silhouettes until the first kill; then a **kill counter toward the next stage** and 3 unlock stages. Exact current counts are legible per creature in its entry, and at a glance only in the **Bestiary Tracker widget — max 50 pinned creatures**, starred by the player | Creature class |
| Bosstiary | A **progress level**: no kills → few kills → Prowess → Expertise → Mastery. Thresholds are fixed per category | Bane / Archfoe / Nemesis |
| Charms | Which charms are unlocked and their level 1–3; charm points available | Charm list |
| Cyclopedia Map | **The percentage of each area discovered.** A subarea needs 7 points of interest; 30% reveals NPCs, 70% passages, 100% creature lists | Area → subarea |
| Quests | The questlog: entries, with started/completed missions | Questlog |
| Titles | All titles with unlock requirements, and which are unlocked | Title list |

Two consequences the current design contradicts:

- **Bosstiary and the Cyclopedia Map are stage/percentage sources.** The app asks for exact boss kills and
  per-subarea booleans; the client offers a level and a percentage. Ask for what is on screen.
- **The star already means something.** The client's Bestiary Tracker holds ≤50 starred creatures — precisely the
  set for which exact counts are readable at a glance. Our bookmark star should mean the same thing, which turns
  "exact kills" from an 833-row demand into a ≤50-row one.

### Comparable tools

TibiaDraptor (the reference, and the source of this repo's datasets) was inspected as a guest. Achievements render
as a card grid with Filters/Sort; Bestiary renders one card per creature showing `0/500` and its charm and Echo
Warden values. Tracking **requires an account**, and there is no hunt-log parsing, no character import, and no
bulk action. So the comparable tool does not solve this problem either — it is the same per-item manual entry with
a nicer card. **This app already has the thing TibiaDraptor lacks: a Hunt Analyzer parser.** That is the asset to
exploit.

### A real derivation source: the public character API

Verified live against `https://api.tibiadata.com/v4/character/<name>`:

- `achievement_points: 1103` — always public.
- `unlocked_titles: 49` — always public.
- `achievements[]` — `{name, grade, secret}`, but **opt-in and usually empty** (one entry for one test character,
  zero for others). Not an import path.
- No bestiary or bosstiary data.

So the API cannot fill the trackers, but it gives two **checksums**. That is worth more than it sounds: it converts
"did I transcribe correctly?" from unanswerable into one number comparison, and it bounds the remaining work
("tibia.com says 1,103 points; you have recorded 940 — 163 points unaccounted for").

### Data-entry practice applied

- **EAS — Eliminate, Automate, Simplify** (NN/g): "Remove questions that are nonessential"; "Minimize manual input
  by leveraging existing or inferable data"; "Speed up input with helpful defaults". The current design skips
  straight to Simplify. Everything below is ordered E → A → S deliberately.
- **GOV.UK task list + complete-multiple-tasks**: for long work across several sittings, show bounded tasks with
  status, save progress, and resume where the user left off.
- **GOV.UK check answers**: a review step before committing, section-level for large transactions.
- **Grid products** (Airtable, Salesforce list views): direct editing, Return/Tab/arrow movement, multi-row
  selection, paste, and applying one value to many selected records.
- **W3C WAI forms guidance**: stored changes should be reversible or confirmed, and users must be able to review
  and correct entries.
- **Unknown ≠ no** is standard survey practice (item nonresponse). A blank that is silently counted as a confirmed
  zero is a fabricated data point.

---

## 4. Journey map per tracker

Format: **client source → what the player sees → site location → what they must provide → save → next → later.**

### 4.1 Bestiary — 833 items, the heaviest

| Stage | Today | Problem |
| --- | --- | --- |
| Source | Cyclopedia → Bestiary → a creature class | — |
| Sees | Per creature: stage + counter toward next threshold. Exact counts only in the entry, or for ≤50 starred creatures in the Tracker widget | The app wants 833 exact numbers; the source shows them 1 or 50 at a time |
| Site | Trackers → Bestiary, 14 pages, Class facet exists | Right grouping is available but is a filter, not a task |
| Provides | `kills` per creature, Echo Warden flag, (`animusMastery` — no control) | Three unrelated facts bundled per row; one of them invisible |
| Save | On blur, silent, no undo | An accidental `4120` for `412` is unrecoverable and silently changes Charm Plan |
| Next | Nothing suggested | No sense of a finished unit |
| Later | Re-find the creature among 833 and retype the total | The session that measured it already knew the delta |

**Wants:** class-sized passes; stage as the default input with exact kills optional; kills auto-proposed from
sessions; Echo Warden and Animus as their own passes.

### 4.2 Bosstiary — 316 items, wrong question

| Stage | Today | Problem |
| --- | --- | --- |
| Source | Cyclopedia → Bosstiary → category | — |
| Sees | A progress level, not a count | — |
| Site | Trackers → Bosstiary, 6 pages | — |
| Provides | Exact `kills` per boss | **The source does not show this.** Thresholds are fixed: Bane 25/100/300, Archfoe 5/20/60, Nemesis 1/3/5. For 109 Nemesis bosses the answer space is {0,1,3,5} |
| Save | As Bestiary | — |
| Later | Retype a number they never knew | — |

**Wants:** a 4-way stage picker (None / Prowess / Expertise / Mastery) storing the threshold kills; exact count as an
optional override. This alone removes 316 numeric fields.

### 4.3 Charms — 25 items, nearly fine

| Stage | Today | Problem |
| --- | --- | --- |
| Source | Cyclopedia → Charms | — |
| Sees | Unlocked charms and level 1–3 | — |
| Site | Trackers → Charms, single page | Correctly small |
| Provides | `stage` 0–3 typed into a number field | A four-value enum entered as free text |
| Save | On blur | — |
| Later | Fine | — |

**Wants:** segmented control `— / 1 / 2 / 3`. Budget already derives from Bestiary; keep that. Lowest priority.

### 4.4 Achievements — 570 items, the biggest derivation win

| Stage | Today | Problem |
| --- | --- | --- |
| Source | Cyclopedia → Achievements, by category | — |
| Sees | Which are earned, with grade and points. Secrets hidden until earned | — |
| Site | Trackers → Achievements, 10 pages | — |
| Provides | `done` per achievement, 570 times | **193 of the 570 (34%) name a quest or questlog that the Quests tracker already knows**; 20 are Cyclopedia Map areas already derived from Measuring Tibia; `achievement_points` is publicly checkable |
| Save | Click → focus dumped to body | Keyboard entry across 570 items is untenable |
| Next | Nothing | — |
| Later | Search among 570 | — |

**Wants:** category passes; mark-Yes-only with an explicit "confirm the rest of this category as No"; quest-derived
proposals; points checksum against tibia.com.

### 4.5 Quests — 237 items in 94 questlogs

| Stage | Today | Problem |
| --- | --- | --- |
| Source | Questlog | — |
| Sees | Questlog entries with mission state | One questlog can cover several of our quests |
| Site | Trackers → Quests, Questlog facet exists | — |
| Provides | `completed` per quest | Reading is per questlog, entry is per quest — the mismatch is real and unavoidable, so the UI should group by questlog and say which quests belong to it |
| Save | Focus loss as above | — |
| Later | — | Completing a quest here should propose its achievement (the 193) |

### 4.6 Titles — 113 items

| Stage | Today | Problem |
| --- | --- | --- |
| Source | Cyclopedia → Titles | Requirements are listed in the client, so this screen is genuinely scannable |
| Sees | All titles, which are unlocked | — |
| Site | Trackers → Titles, 2 pages | — |
| Provides | `earned` per title | `unlocked_titles` (49) is publicly checkable — a free count check |
| Save | Focus loss | — |
| Later | Losable titles can be *lost*; nothing models re-checking them | 57 of 113 are non-permanent |

**Wants:** two passes (Permanent, Losable) since only one of them can regress; count checksum.

### 4.7 Measuring Tibia — 171 subareas in 20 areas, wrong grain

| Stage | Today | Problem |
| --- | --- | --- |
| Source | Cyclopedia Map → area | — |
| Sees | **A percentage per area** | The app asks for 171 per-subarea booleans; the client's headline number is a percentage |
| Site | Trackers → Measuring Tibia, Area facet exists | — |
| Provides | `discovered` per subarea | Finer than the source. A player who sees "Thais 62%" cannot answer "is Thais Bank discovered?" without opening the area detail |
| Save | Focus loss | — |
| Next | Completing an area derives its achievement — **this already works and is the model to copy** | — |
| Later | — | — |

**Wants:** area-level passes; keep subarea marks for players who do open the detail, but accept
"n of m subareas" / a percentage at area level and reconcile.

---

## 5. Root problems, ranked

1. **The app asks for facts it owns.** Sessions parse exact per-creature kills and discard them for progress
   purposes; 193 achievements are implied by quests; 20 are already derived from the map; two public checksums exist.
2. **Unknown is stored as zero.** Every headline conflates "not transcribed" with "confirmed none", which makes the
   numbers untrustworthy exactly where trust is the product.
3. **The wrong question for Bosstiary and the Map.** Exact counts and per-subarea booleans are not what the source
   shows.
4. **No unit of completion.** 14 pages, no bounded task, no stopping point, no resume, nothing suggested next.
5. **Boolean entry destroys keyboard position** and rows vanish under the pointer while filtered.
6. **No undo, no diff on import.** The riskiest operations in the app are the least reviewed.
7. **One generic table for seven different data shapes** — plus the concrete inconsistencies in §2.

---

## 6. Derivation ledger

What could stop being manual, with sizes. This is the whole argument for doing Eliminate/Automate before Simplify.

| Source already in the app | Target | Items affected | Confidence | Treatment |
| --- | --- | --- | --- | --- |
| Parsed session `Killed Monsters` counts | Bestiary `kills` | Every creature in every session | Exact for the delta | **Propose** `prior + delta = new`, review, undo |
| Measuring Tibia area completion | Achievements | 20 | Certain | Already derived — the working precedent |
| Quest completion → achievement text match | Achievements | **193 of 570** | Textual; needs review | Propose, never auto-apply |
| Bestiary stage thresholds | Bestiary charm points, stage, remaining | 833 | Certain | Already derived |
| Boss category thresholds | Bosstiary stage ↔ kills | 316 | Certain | Make the stage the input |
| Bestiary earned points | Charms budget | — | Certain | Already derived |
| `achievement_points` (tibia.com) | Achievements total check | 1 number vs 1,499 | Certain | Checksum, not import |
| `unlocked_titles` (tibia.com) | Titles count check | 1 number vs 113 | Certain | Checksum |
| Cyclopedia Map area % | Measuring Tibia subareas | 171 | Partial | Accept the area figure, reconcile |

Nothing here removes the need for a baseline pass. It removes most of the *recurring* typing, and it makes the
baseline checkable.

---

## 7. Proposed flows

### F0 — The model change: three states, not two

Every progress field gains a third state: **unknown** (never asserted), alongside the value itself. Storage stays
sparse; "unknown" is simply the absence of a record *within a pass that has not been completed*. Completing a pass
is what writes explicit zeros/Nos for its untouched items.

Consequences in the UI:
- Headline reads `5 charm points · 829 unknown` rather than implying 829 confirmed zeros.
- A blank kill field renders as `—`, not `0`.
- Charm Plan and Opportunities can say "based on 4 of 21 classes transcribed".

This is the one change everything else depends on, and it is the one the current app cannot express at all.

### F1 — Sync pass (baseline)

Entered from **Update progress → Full check**, then a GOV.UK-style task list of passes for the chosen tracker:

```
Bestiary · kills                    Echo Warden        (separate pass)
  Amphibic      11 items   Synced today
  Aquatic       40 items   In progress · 12 of 40
  Bird          18 items   Not started
  …21 classes
```

Inside a pass — and this is where the seven diverge (§8) — the surface shows **one field**, in source order, and:

- unmarked means *unknown*, not No;
- the player enters only exceptions;
- Return commits and advances; arrows move; focus is never stolen;
- search filters within the pass without resetting position;
- paste of a rectangular `name  count` block is accepted, previewed, and rejects ambiguous names.

Then a **check-answers review** naming its own scope:

> **Sync 18 Amphibic Bestiary entries** — 3 totals entered · 8 untouched creatures will be saved as 0 ·
> 1 value out of range (Azure Frog 5,000 > 500 target)

Committing stores the pass, its timestamp, and the prior values, so the whole pass is undoable as one action. The
task list then stamps it `Synced today` and suggests — never forces — the next pass.

### F2 — Quick update (upkeep)

One global search (the `/` already in the sidebar), any tracker, any item:

> `rotworm` → **Rotworm** · Bestiary · currently 412 / 500
> `[ 460 ]` Save → *"Rotworm 412 → 460. Undo"*

No pass, no review step, explicit before → after, undoable. This is the flow that should carry 95% of day-to-day use
and it does not exist today.

### F3 — Session evidence inbox (the biggest win)

The session already knows the delta. So:

1. Processing a Hunt Analyzer creates **proposals**, not writes: `Rotworm 412 · Carrion Worm 97 · Azure Frog 18`.
2. A badge appears on the tracker: `3 changes to review`.
3. The review shows `prior + session = proposed` per creature, with per-row accept/skip and one **Accept all**.
4. Guards, all of which the current code has no notion of: a session dated before the last completed baseline pass
   is presumed already counted and is skipped unless overridden; re-processing the same session cannot create a
   second proposal; accepting a newer baseline closes older pending deltas for the same scope.

The row that reads `Session Kills 412 · Total Kills [ ] · Kills Remaining 500` becomes
`Session Kills 412 · Total 412 (from this session) · Kills Remaining 88`, one click.

### F4 — Reconcile against tibia.com

In **Data & backup**: enter a character name once, fetch the two public numbers, and show a comparison.

> Achievement points — tibia.com **1,103** · recorded **940** · **163 unaccounted for**
> Unlocked titles — tibia.com **49** · recorded **49** · ✔ matches

It never writes. It tells the player whether the baseline is trustworthy and roughly how much is missing, which is
the question a manual ledger can otherwise never answer. (Note: the public `achievements` array is opt-in and
usually empty, so this is a check, not an import — do not promise otherwise in the UI.)

### F5 — Import with a diff

Replace the single count-only `confirm` with a field-level preview before anything is written: additions, changes
(`412 → 460`), conflicts, unmatched names, and items the file does not mention (left unknown, not zeroed). One undo
step for the whole import.

### F6 — Interaction rules, applied everywhere

- **Focus is never stolen.** Patch the changed row instead of re-rendering the table; keep focus and selection.
- **Filtered rows do not vanish mid-pass.** A marked item stays in place, visibly struck through, until the pass is
  reviewed.
- **Undo for every write**, one level minimum, surfaced where the change happened.
- **Out-of-range values are caught** at the moment of entry (`5,000 > 500`), not silently stored.
- **The primary control never clips.** Below ~1190 px the entry column pins or the layout switches to a
  two-line row; the input is the last thing that may be scrolled away.

---

## 8. Input method per tracker — deliberately not identical

| Tracker | Pass unit | Primary control | Rationale |
| --- | --- | --- | --- |
| Achievements | Category (18) | **Mark-Yes-only checklist** + "confirm remaining as No" | 570 items, sparse truth, most players own a minority |
| Bestiary | Creature class (21) | **Stage picker** (Not started / 1 / 2 / Complete) with an optional exact-kills field, exact required only for starred creatures | Matches what the client shows; ≤50 starred creatures are the only ones with legible counts |
| Bosstiary | Category (3) | **Stage picker** (None / Prowess / Expertise / Mastery) → stores threshold kills | The client shows a level, not a count |
| Charms | Type (2) | **Segmented 0–3** | 25 items, four-value enum |
| Measuring Tibia | Area (20) | **Area percentage or n-of-m**, subarea marks optional | The client's visible figure is a percentage |
| Quests | Questlog (94) | **Mark-Yes-only, grouped by questlog** showing which quests each covers | Reading unit ≠ storage unit |
| Titles | Permanent / Losable | **Mark-Yes-only**, losable set re-checkable | Only one of the two can regress |

---

## 9. Acceptance criteria

Inherited from the previous audit (all still required), plus:

1. A blank field is reported as **unknown**, never as a confirmed zero, anywhere in the app including Charm Plan and
   Opportunities.
2. No tracker asks for a number the Tibia client does not display, unless the player opts into exact entry.
3. Processing a session never writes to the ledger without a review, and accepting its proposals requires no typing.
4. Every write is undoable, including a whole pass and a whole import.
5. Marking an item never moves focus and never reorders rows mid-pass.
6. `achievement_points` and `unlocked_titles` are surfaced as checks and never written into progress.
7. Quest-derived achievement proposals are always reviewable and never silent; the 20 map-derived ones stay locked.
8. The entry control is reachable without horizontal scrolling at 768 px and above.
9. Baseline-to-first-useful-answer for one creature class is under two minutes with the client open.

## 10. Evidence limits

- Measurements are from this repository running locally in one browser at 1440×900 and 850×987. No real player was
  observed, no screen reader was run, no touch device was used.
- Client behaviour is taken from the official game guide and TibiaWiki, not from the client itself. The claims that
  most need confirming with Tibia open beside the app are: exactly where an exact kill count is legible in the
  Bestiary; whether the Cyclopedia Map exposes per-subarea state as well as an area percentage; and the client's own
  ordering within each class and category, which the pass order should match.
- The 193 quest→achievement matches are textual and were not verified one by one; they justify a *proposal* flow,
  not automatic marking.
- `achievement_points` and `unlocked_titles` were verified live on several characters; the `achievements` array was
  empty or near-empty on all of them, which is why it is not treated as an import path.

## Sources

- Tibia game guide, interface manual: <https://www.tibia.com/gameguides/?subtopic=manual&section=interface>
- TibiaWiki Cyclopedia: <https://tibia.fandom.com/wiki/Cyclopedia>
- TibiaScape Bestiary: <https://tibiascape.wiki/Bestiary>
- TibiaDraptor (comparable tool, guest inspection): <https://tibiadraptor.com/bestiary>
- TibiaData API v4 character endpoint: <https://docs.tibiadata.com/>
- NN/g, EAS framework: <https://www.nngroup.com/articles/eas-framework-simplify-forms/>
- NN/g, reducing cognitive load in forms: <https://www.nngroup.com/articles/4-principles-reduce-cognitive-load/>
- GOV.UK task list: <https://design-system.service.gov.uk/components/task-list/>
- GOV.UK complete multiple tasks: <https://design-system.service.gov.uk/patterns/complete-multiple-tasks/>
- GOV.UK check answers: <https://design-system.service.gov.uk/patterns/check-answers/>
- Airtable keyboard shortcuts: <https://support.airtable.com/airtable-keyboard-shortcuts>
- W3C WAI form validation: <https://www.w3.org/WAI/tutorials/forms/validation/>
