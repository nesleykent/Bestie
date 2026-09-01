# UX Journey Acceptance Scenarios

## Purpose

These scenarios validate the journey model without prescribing layout or visual treatment. Each scenario tests a user goal, the transition between capabilities, the context that must survive, and the condition that closes the task.

## Scenario Format

- **Given** establishes user-owned truth, evidence, and intent.
- **When** names the key action.
- **Then** describes the required consequence and next state.
- **Return** states where the user continues after a contextual detour.
- **Recovery** states what happens when the action cannot complete.

## Entry and Orientation

### S01 — First use with no recorded data

- **Given:** no progress, evidence, objective, task, or import draft exists.
- **When:** the player opens the product.
- **Then:** the product asks which outcome they need and requests only the minimum prerequisite for that intent.
- **Return:** completing the prerequisite returns to the chosen intent.
- **Recovery:** leaving preserves any chosen intent and safe draft input.

### S02 — Returning with an active objective

- **Given:** one primary objective is active.
- **When:** the player returns after leaving the product.
- **Then:** the active objective, reason, remaining work, and supporting source are resumed.
- **Return:** recording the latest hunt returns to objective resolution.
- **Recovery:** a missing supporting source is explained and can be replaced without deleting the objective.

### S03 — Returning with unreconciled evidence

- **Given:** a hunt was processed but not reconciled.
- **When:** the player returns.
- **Then:** review of the pending evidence takes priority over generating a new recommendation.
- **Return:** reconciliation returns to the intent that created the hunt.
- **Recovery:** the player can defer review; evidence remains explicitly pending.

## Bestiary Progress and Decisions

### S04 — Record unknown Bestiary progress

- **Given:** the player is copying exact values from one Tibia Bestiary class and Dragon is the current row.
- **When:** the player records 642 total kills and presses Enter.
- **Then:** Dragon saves, dependent estimates refresh, and focus advances to the next visible creature without moving or rerendering the list.
- **Return:** leaving and reopening Bestiary restores the same class, filters, page, row, and scroll position; contextual entry instead returns to its recommendation after saving.
- **Recovery:** invalid input preserves the previous valid value and current position; undo restores the prior value without ending the sequence.

### S05 — Confirm a recorded zero

- **Given:** a creature has no recorded progress.
- **When:** the player explicitly records zero.
- **Then:** the product treats the value as confirmed zero and may use it in calculations.
- **Return:** the originating task continues.
- **Recovery:** clearing the field restores unknown rather than silently storing zero.

### S06 — Choose a measured opportunity

- **Given:** a creature is incomplete and has valid measured evidence.
- **When:** the player chooses it from Finishable Now.
- **Then:** an active objective is created with the chosen evidence and ranking reason.
- **Return:** opening and closing evidence returns to the candidate position or active objective.
- **Recovery:** if evidence becomes invalid, the objective remains but time is marked unavailable.

### S07 — Choose a progress-only quick win

- **Given:** a creature is near completion but no measured evidence exists.
- **When:** the player chooses it as an objective.
- **Then:** the objective is active with remaining kills and reward, while time is explicitly unknown.
- **Return:** measuring the hunt returns to the same candidate with evidence added.
- **Recovery:** failing to parse a hunt preserves the objective and pasted text.

### S08 — Explore a location recommendation

- **Given:** a location contains several incomplete creatures.
- **When:** the player opens the location candidate.
- **Then:** the location expands into ranked creature objectives while retaining the location reason.
- **Return:** backing out restores the prior recommendation order.
- **Recovery:** creatures with unknown progress are labeled and excluded from false totals.

### S09 — Use a bookmark

- **Given:** a Bestiary creature is bookmarked.
- **When:** the player opens decision candidates.
- **Then:** the bookmark appears as a candidate with progress, evidence, and locations.
- **Return:** choosing it creates an objective; dismissing it leaves the bookmark intact unless explicitly removed.
- **Recovery:** if bookmarks are not decision inputs, the bookmark action must not be offered.

## Hunt Evidence

### S10 — Process a valid Hunting Analyser

- **Given:** valid raw text contains duration and killed monsters.
- **When:** the player processes it.
- **Then:** a hunt session and evidence links are created, then reconciliation begins.
- **Return:** reconciliation returns to the objective, plan, task, or history entry point.
- **Recovery:** no existing evidence or truth is overwritten before review.

### S11 — Process partially matched evidence

- **Given:** duration and killed monsters are valid but one creature name is unmatched.
- **When:** the player processes the text.
- **Then:** matched, unmatched, and ignored content are separated before save.
- **Return:** acknowledging or correcting the unmatched item continues to reconciliation.
- **Recovery:** raw text remains intact and the unmatched list can be copied or exported.

### S12 — Process invalid evidence

- **Given:** the pasted text lacks duration or a killed-monster block.
- **When:** the player processes it.
- **Then:** the exact missing section is identified and no false estimate is created.
- **Return:** correction resumes the same capture step.
- **Recovery:** raw text, origin, objective, and task target remain intact.

### S13 — Reprocess stored evidence

- **Given:** a saved session supports a current plan.
- **When:** the player changes its raw analyser and processes again.
- **Then:** a revision preview shows how evidence and dependents will change.
- **Return:** accepting returns to the plan, now marked recalculated or outdated.
- **Recovery:** rejecting restores the previous parsed result and dependency links.

### S14 — Reconcile session kills and total kills

- **Given:** a session measured 100 Dragon kills and recorded character truth is 642.
- **When:** the player reviews the evidence.
- **Then:** session kills remain 100; total kills remain 642 unless the player separately changes the total.
- **Return:** confirmation proceeds to objective resolution.
- **Recovery:** leaving the total unchanged never auto-adds 100.

## Bestiary Sessions, Comparison, and Plans

### S15 — Choose representative evidence

- **Given:** Dragon appears in two sessions with different measured rates.
- **When:** the player chooses one as preferred evidence.
- **Then:** the decision context records the explicit evidence link without altering either session.
- **Return:** plans and recommendations disclose which session they use.
- **Recovery:** archiving the preferred session asks for a replacement or removes time confidence.

### S16 — Compare sessions under equal conditions

- **Given:** at least two valid sessions share the same respawn condition.
- **When:** the player compares by charm efficiency.
- **Then:** the leader is explained and every row can be inspected or chosen.
- **Return:** inspecting a row returns to the same comparison question and order.
- **Recovery:** incomplete sessions are excluded with a reason.

### S17 — Compare mixed respawn modes

- **Given:** Regular and Rapid Respawn sessions exist.
- **When:** the player opens comparison.
- **Then:** the product groups by condition or asks which condition to compare; it does not present one false shared ranking.
- **Return:** changing condition preserves the comparison origin.
- **Recovery:** if only one session remains in a condition, explain why ranking is unavailable.

### S18 — Build and commit a Charm Plan

- **Given:** progress, valid evidence, play time, and eligible sessions exist.
- **When:** the player commits the first recommended route step.
- **Then:** that step becomes the active objective and the plan snapshot is preserved.
- **Return:** inspecting or correcting source data returns to the same plan position.
- **Recovery:** changed progress marks the plan outdated before automatic replacement.

### S19 — Resolve a blocked Charm Plan

- **Given:** the plan has no result because sessions use the wrong respawn mode.
- **When:** the player opens the blocking explanation.
- **Then:** the exact sessions and condition mismatch are identified.
- **Return:** correcting a session or changing the plan condition returns to a recalculated plan.
- **Recovery:** cancellation preserves the previous constraints and result.

## Completion Trackers

### S20 — Bosstiary goal

- **Given:** a boss is below the next stage.
- **When:** the player commits the next boss stage as a goal.
- **Then:** the objective preserves boss, threshold, category/cooldown meaning, and Boss Points outcome.
- **Return:** recording current kills resolves or continues the goal.
- **Recovery:** an impossible or changed threshold marks the goal needs-review.

### S21 — Charm goal with insufficient currency

- **Given:** a Major charm stage costs more Charm Points than currently available.
- **When:** the player commits the charm stage.
- **Then:** the charm remains the parent goal and the exact shortfall produces Bestiary prerequisite candidates.
- **Return:** completing a prerequisite returns to the charm and rechecks affordability.
- **Recovery:** pausing the prerequisite does not delete the parent charm goal.

### S22 — Minor charm currency isolation

- **Given:** a Minor charm requires Minor Charm Echoes.
- **When:** the player reviews affordability.
- **Then:** only echoes and their Major-stage sources are used; Charm Points are not substituted.
- **Return:** confirming a purchased stage updates the echo balance.
- **Recovery:** a negative balance blocks confirmation and explains the conflicting recorded stage.

### S23 — Achievement or quest goal

- **Given:** an achievement or quest is incomplete.
- **When:** the player commits it as a goal.
- **Then:** requirement, reward/points, spoiler preference, and return action persist.
- **Return:** marking it complete resolves the objective and offers the next candidate.
- **Recovery:** canceling a spoiler reveal preserves the hidden state.

### S24 — Losable title ownership

- **Given:** a title can be lost.
- **When:** the player records current ownership.
- **Then:** the tracker stores current truth rather than claiming permanent historical completion.
- **Return:** the goal resolves only while ownership is current.
- **Recovery:** losing the title reopens or archives the goal according to player choice.

### S25 — Measuring Tibia completion

- **Given:** an area has undiscovered subareas and a derived achievement.
- **When:** the player records a discovered subarea.
- **Then:** area progress, reward context, and derived achievement update together.
- **Return:** completing the final subarea resolves the area goal.
- **Recovery:** the achievement cannot be toggled independently into a conflicting state.

## Task Estimates

### S26 — Create a task from existing evidence

- **Given:** a session measured the task creature.
- **When:** the player enters a target.
- **Then:** a separate task estimate references the evidence and shows remaining kills and time.
- **Return:** opening the source session returns to the same task.
- **Recovery:** a missing duration preserves the target and shows count without fake time.

### S27 — Attach new evidence to an active task

- **Given:** an active task already references one evidence link.
- **When:** the player records another hunt containing the same creature.
- **Then:** the player chooses whether the new evidence replaces the rate source or remains historical.
- **Return:** the task recalculates and explains the rate change.
- **Recovery:** rejecting the new rate preserves the previous estimate.

### S28 — Reuse one session for two tasks

- **Given:** one session measured two task creatures.
- **When:** the player creates a second task estimate.
- **Then:** each task owns its creature and target while both reference the same immutable session.
- **Return:** resolving one task leaves the other unchanged.
- **Recovery:** archiving the session discloses both affected tasks.

## History and Data Safety

### S29 — Archive a depended-on session

- **Given:** a session supports an objective, plan, comparison, or task.
- **When:** the player archives it.
- **Then:** dependencies are listed before confirmation and the player can replace evidence or accept degraded confidence.
- **Return:** archive completion returns to history with undo.
- **Recovery:** undo restores both the session and dependency links.

### S30 — Import tracker progress safely

- **Given:** saved progress already exists.
- **When:** the player chooses an import file.
- **Then:** matched, changed, unchanged, invalid, and unmatched rows are previewed before replacement.
- **Return:** successful import returns to the prior collection/filter and shows consequences.
- **Recovery:** failure or cancellation leaves all current data unchanged; success offers undo.

### S31 — Restore a workspace safely

- **Given:** the current workspace contains progress, sessions, objectives, and tasks.
- **When:** the player chooses a workspace file.
- **Then:** content counts, version compatibility, and conflicts are previewed before atomic replacement.
- **Return:** successful restore opens the state-derived entry destination.
- **Recovery:** a pre-import snapshot supports undo until the next data-changing action.

## Cross-Feature Invariants

1. Updating Bestiary truth recalculates dependent decisions but never changes session evidence.
2. Updating non-Bestiary trackers never changes hunt maths.
3. A plan constraint never edits session metadata.
4. A task target never changes Bestiary or Charm Point calculations.
5. A contextual detour always returns to its origin with its position and draft intact.
6. A recommendation without an action fails acceptance.
7. A destructive or replacement action without dependency preview and recovery fails acceptance.
8. Unknown progress cannot enter arithmetic as confirmed zero.
9. Evidence changes preserve provenance and mark dependents outdated.
10. The external act in Tibia is represented by a persistent objective that survives leaving the product.

## Capability Traceability

| Shipped capability | Governing scenarios | Journey outcome |
|---|---|---|
| Achievements Tracker | S23, S25 | Resumable achievement goal without derived-state conflict |
| Bestiary Tracker | S04, S05, S09, S14 | Reliable creature truth that feeds decisions |
| Bosstiary Tracker | S20 | Resumable boss-stage goal |
| Charms Tracker | S21, S22 | Affordable charm-stage goal with prerequisite return |
| Measuring Tibia Tracker | S25 | Area goal with subarea and derived-achievement closure |
| Quests Tracker | S23 | Resumable quest goal with spoiler control |
| Titles Tracker | S24 | Current ownership modeled correctly for losable titles |
| Bestiary Session Capture | S10–S13 | Validated, revision-safe measured evidence |
| Bestiary Session Estimate | S06, S07, S14 | Actionable objective using disclosed truth and evidence |
| Bestiary Sessions Overview | S15 | Explicit preferred evidence without session mutation |
| Session Comparison | S16, S17 | Inspectable and selectable comparison under valid conditions |
| Charm Plan | S18, S19 | Committed route step with preserved plan context |
| Opportunities | S06–S09 | Every recommendation becomes an objective or evidence action |
| Session Library | S13, S29 | Reusable, correctable, recoverable evidence history |
| Task Session | S26–S28 | Independent task goal referencing immutable evidence |
| Data and Backup | S30, S31 | Previewed, atomic, recoverable data movement |

Coverage passes only when every capability has at least one successful scenario, one relevant recovery rule, and a defined next state. The scenarios above deliberately share cross-feature transitions so capabilities are validated as one product journey rather than isolated modules.

## Acceptance Threshold

The UX journey passes only when all 31 scenarios can be implemented without inventing a missing state, owner, transition, return path, or recovery rule. Visual composition is evaluated later and cannot compensate for a failing journey scenario.
