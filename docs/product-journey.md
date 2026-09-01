# Product Foundation and Journey — Rebuilt from Scratch

The governing user loop, cross-feature transitions, and recovery behavior are defined in [UX Journey System](ux-journey-system.md). Detailed capability behavior, responsive rules, and accessibility are defined in [Complete UX Architecture](ux-architecture.md).

## Status

This document replaces the previous product and navigation assumptions. It is based on a fresh inventory of the repository, all seven shipped datasets, the current application behavior, and current official Tibia documentation as of August 11, 2026.

No previous visual metaphor is carried forward. A new visual direction must be selected only after this product model is accepted.

## What Tibia Actually Requires

The app sits between several systems that Tibia exposes separately:

- Achievements are completion goals with grades and points; quests are resumable adventures with their own quest-log state. They are related to character completion, but they are not hunting-session calculations. [Official achievements guide](https://www.tibia.com/gameguides/?section=achievements&subtopic=manual), [official quests guide](https://www.tibia.com/gameguides/?section=quests&subtopic=manual)
- Bestiary entries advance through kill thresholds; completing an entry unlocks the ability to assign charms. Tibia separates session analytics from this persistent creature progress. [Official interface guide](https://www.tibia.com/gameguides/?section=interface&subtopic=manual)
- Bosstiary uses Prowess, Expertise, and Mastery, with different kill thresholds for Bane, Archfoe, and Nemesis bosses. Boss progress also creates boss points and loot-slot benefits. [Official Bosstiary announcement](https://www.tibia.com/news/?id=6733&subtopic=newsarchive)
- Major and minor charms have separate rules, three upgrade stages, and different currencies. Minor Charm Echoes are distinct from Charm Points. [Official charm-overhaul announcement](https://www.tibia.com/news/?id=8140&subtopic=newsarchive)
- Measuring Tibia tracks areas and subareas. The 2026 discovery update makes subareas automatically active and adds area speed rewards, so the tracker is long-term exploration progress rather than a manual “start discovery” workflow. [Official 2026 discovery update](https://www.tibia.com/news/?id=8834&subtopic=newsarchive)
- The Hunting Analyser is evidence from one hunt: duration and killed monsters can be copied from the client. It does not replace character-wide progress. [Official analytics announcement](https://www.tibia.com/news/?id=4160&subtopic=newsarchive)
- Echo Warden progress is creature-specific, separate from normal Bestiary kills, and rewards additional charm points for the first Echo Warden of a creature type. [Official Echo Warden announcement](https://www.tibia.com/news/?id=8834&subtopic=newsarchive)

The product must therefore keep three concepts separate:

1. **Character truth** — persistent progress owned by the character.
2. **Hunt evidence** — measured performance from one copied Hunting Analyser.
3. **Decisions** — recommendations and estimates calculated from truth plus evidence.

## Product Contract

### What is this product?

A Tibia character-progress and hunt-planning workspace. It stores long-term completion truth, learns realistic kill rates from the player's own hunts, and converts both into a clear next objective.

### Who is it for?

- Active Tibia players working on Bestiary or charms.
- Completionists tracking achievements, bosses, exploration, quests, and titles.
- Returning players who need to reconstruct what remains.
- Players using measured hunts to decide what fits into their available play time.
- Players estimating creature-kill tasks from their own performance rather than a generic rate.

### Why will they use it?

Tibia exposes progress and analytics in several separate places. This product gives the player one persistent character record and uses their own measured performance to answer a practical question: **what should I do next, and how long will it take?**

### What is the one key action?

**Choose my next Tibia objective.**

Updating progress and importing a hunt are supporting actions. The product succeeds when the player leaves with a specific creature, location, boss, task, or completion target to pursue.

## Complete Capability Inventory

### 1. Achievements Tracker

- **What is it?** Completion for 570 achievements, with category, grade, rarity, points, secret status, description, and bookmarks.
- **Who is it for?** Completionists and players pursuing achievement points or rare goals.
- **Why use it?** It makes a very large goal set searchable and turns long descriptions into a manageable completion list.
- **One key action:** Mark an achievement earned.

### 2. Bestiary Tracker

- **What is it?** Character-wide progress for 833 creatures: kills, completion stage, remaining kills, Charm Points, Echo Warden progress, Animus Mastery, and bookmarks.
- **Who is it for?** Charm farmers, completionists, and any player using Bestiary sessions.
- **Why use it?** It is the single source of truth that every Bestiary session and planning calculation reads.
- **One key action:** Update or import creature progress.

### 3. Bosstiary Tracker

- **What is it?** Progress for 316 bosses across Bane, Archfoe, and Nemesis categories, including kills, next stage, remaining kills, boss points, and bookmarks.
- **Who is it for?** Boss hunters and players working toward boss-slot benefits or Bosstiary titles.
- **Why use it?** Boss thresholds and cooldown categories make manual tracking difficult, especially across a long character history.
- **One key action:** Record a boss kill.

### 4. Charms Tracker

- **What is it?** Ownership and upgrade progress for 25 major and minor charms, including stage, spent currency, next-stage cost, and completion.
- **Who is it for?** Players deciding where to spend Charm Points and Minor Charm Echoes.
- **Why use it?** Charm upgrades span three stages and two currencies; the tracker shows what is owned, spent, available, and next.
- **One key action:** Set the current stage of a charm.

### 5. Measuring Tibia Tracker

- **What is it?** Discovery progress for 20 areas and 171 subareas, including associated Bestiary creatures and automatically derived area achievements.
- **Who is it for?** Explorers, outfit collectors, completionists, and players pursuing area speed rewards.
- **Why use it?** It turns a geographically distributed discovery activity into an area-by-area completion plan.
- **One key action:** Mark a subarea discovered.

### 6. Quests Tracker

- **What is it?** Completion for 237 quests, searchable by quest, questlog, or reward.
- **Who is it for?** Returning players, questers, and players planning access or reward unlocks.
- **Why use it?** It provides a durable overview beyond the in-client active-quest view.
- **One key action:** Mark a quest completed.

### 7. Titles Tracker

- **What is it?** Progress for 113 titles, including unlock requirements, permanence, status, and bookmarks.
- **Who is it for?** Completionists and players pursuing visible character identity goals.
- **Why use it?** Permanent and losable titles have different planning value and are earned through many unrelated systems.
- **One key action:** Mark a title earned.

### 8. Bestiary Session Capture

- **What is it?** A parser that turns copied Hunting Analyser text into one measured hunt with duration, killed creatures, respawn mode, name, date, and notes.
- **Who is it for?** Players who want estimates based on their own character, route, and hunting conditions.
- **Why use it?** A generic online rate cannot represent the player's real performance or the conditions of a specific spawn.
- **One key action:** Paste and process a Hunting Analyser.

### 9. Bestiary Session Estimate

- **What is it?** Per-creature calculations for session kills, kill rate, character-wide kills, remaining kills, completion time, charm reward, and charm rate.
- **Who is it for?** Players deciding whether a measured spawn is worth continuing.
- **Why use it?** It connects persistent Bestiary truth to real measured speed.
- **One key action:** Select the creatures to pursue from the session.

### 10. Bestiary Sessions Overview

- **What is it?** A combined view of every processed Bestiary session, retaining each session's own measured rate and selection.
- **Who is it for?** Players comparing several known hunting options.
- **Why use it?** The same creature can appear in multiple hunts with different rates; the overview makes those alternatives comparable without pretending the rates are one combined value.
- **One key action:** Choose which session should represent each objective.

### 11. Session Comparison

- **What is it?** A ranking of analyzed sessions by total charms, longest completion time, and charm rate.
- **Who is it for?** Players choosing between complete hunt options.
- **Why use it?** It answers which measured session is most efficient as a whole.
- **One key action:** Open the strongest session.

### 12. Charm Plan

- **What is it?** A time-budget optimizer across eligible measured sessions. It respects regular versus rapid respawn, spawn availability, discrete completion rewards, and selected creatures.
- **Who is it for?** Players with a fixed play window who want the most completed Charm Points.
- **Why use it?** Bestiary rewards are discrete; partial progress does not earn points, and several creatures in one spawn advance simultaneously.
- **One key action:** Enter available play time.

### 13. Opportunities

- **What is it?** A decision view that finds finishable measured creatures, quick wins, high-value locations, and started entries no stored session currently covers.
- **Who is it for?** Players who do not already know what to hunt next.
- **Why use it?** Session-only analysis cannot reveal progress that has never appeared in a saved hunt.
- **One key action:** Open one recommended objective.

### 14. Session Library

- **What is it?** The durable archive for session names, hunt dates, respawn modes, duration, charm results, notes, search, sorting, and deletion.
- **Who is it for?** Players building a personal record of viable spawns and routes.
- **Why use it?** A hunt is reusable evidence, not a disposable calculation.
- **One key action:** Reopen a stored session.

### 15. Task Session

- **What is it?** A separate estimator that uses one measured session to project a user-defined creature-kill target.
- **Who is it for?** Players completing killing tasks whose thresholds are unrelated to Bestiary unlocks.
- **Why use it?** It answers “how long will my target take at this measured rate?” without contaminating charm calculations.
- **One key action:** Choose a creature and enter the task target.

### 16. Data and Backup

- **What is it?** Local persistence, tracker CSV/JSON import, tracker CSV export, and whole-workspace JSON backup/restore.
- **Who is it for?** Every player who wants trustworthy progress across browser sessions or devices.
- **Why use it?** Re-entering hundreds of progress values is unacceptable, and imported game data must not overwrite user-owned progress fields.
- **One key action:** Import progress or create a backup.

## New Information Architecture

The previous interface exposed implementation categories. The rebuild should expose the player's mental model.

### Primary destinations

1. **Next Objective** — the decision entry point.
2. **Character Progress** — all seven persistent trackers.
3. **Bestiary Hunts** — new session, active session, session library, and session overview.
4. **Plans** — Charm Plan, Opportunities, and session comparison.
5. **Task Estimates** — task sessions only.
6. **Data** — tracker imports and whole-workspace backup.

### Rules

- Character Progress never behaves like a hunt session.
- A hunt session never owns character-wide Bestiary kills.
- Plans consume Progress and Hunts; they do not create a third progress store.
- Task Estimates consume Hunt evidence but never appear in charm totals.
- Data operations are utilities, not primary workflow destinations.
- Each screen has one dominant action and no more than two supporting actions above the fold.

## Core Journeys

### First-time player

1. Land on **Next Objective** and see that recommendations need character truth or hunt evidence.
2. Import Bestiary progress, or enter progress manually.
3. Paste and process a Hunting Analyser.
4. Review matched creatures and measured rates.
5. Enter available time or open Opportunities.
6. Leave with one explicit hunt objective.

### Returning planner

1. Land on **Next Objective**.
2. See unfinished high-value progress and the strongest measured opportunities.
3. Choose a play-time budget.
4. Review the recommended route and why each step fits.
5. Open the supporting session if details need adjustment.
6. Hunt in Tibia, then paste the new analyser to refresh evidence.

### Completionist

1. Open **Character Progress**.
2. Choose a collection: Achievements, Bestiary, Bosstiary, Charms, Measuring Tibia, Quests, or Titles.
3. Search or filter to the relevant goal set.
4. Update one progress value or bookmark the next objective.
5. Return to **Next Objective** only when a decision is needed.

### Task player

1. Open **Task Estimates**.
2. Select an existing measured session or paste a new analyser.
3. Choose the task creature.
4. Enter the target kill count.
5. Read kills remaining and estimated time.

## Screen Contracts

### Next Objective

- First: one recommended objective with reason, expected time, and reward.
- Trust: identify the character progress and measured session supporting the recommendation.
- Confidence: show alternatives only after the primary recommendation.
- Action: open the relevant plan or session.

### Character Progress

- First: collection name and meaningful completion summary.
- Trust: visible dataset size and user-owned progress state.
- Confidence: search, filters, sort, and a clear progress model.
- Action: update one entry or import progress.

### Bestiary Hunt

- First: session identity and whether a log has been processed.
- Trust: recorded duration, respawn mode, and exact matched creatures.
- Confidence: measured rates and character-wide progress are visually distinguished.
- Action: select the objectives to continue.

### Plan

- First: the decision answer, not the input form.
- Trust: show which sessions and progress values were used.
- Confidence: explain exclusions such as wrong respawn mode or unavailable spawn.
- Action: open the first recommended route step.

### Task Estimate

- First: creature and target.
- Trust: measured session kills, duration, and rate.
- Confidence: explicit remaining kills and time.
- Action: open or update the source session.

## Design Brief for Fresh Visual Exploration

- Surface: responsive desktop web application, primary design at 1440 × 1024.
- Product character: decisive, legible, calm, precise, and game-aware without looking like the Tibia client.
- Required qualities: strong hierarchy, generous component spacing, readable tables, clear action priority, visible relationship between progress and evidence, restrained color, and excellent responsive behavior.
- Prohibited inheritance: no Notion imitation, no database-page metaphor, no reuse of the current layout, no card grid that treats every feature equally, and no decorative medieval fantasy skin.
- Primary concept screen: **Next Objective** with one recommended Bestiary hunt, its supporting measured session, expected completion time and Charm Points, plus restrained access to Progress, Hunts, Plans, and Tasks.
- Supporting state visible in the concept: persistent navigation, one progress context, one session evidence context, and one clear primary action.

## Acceptance Criteria Before Implementation

- Three independent visual directions are generated from this brief.
- Each direction has a different hierarchy and interaction model, not merely different colors.
- The selected direction clearly separates truth, evidence, and decision.
- The first viewport has one dominant action.
- Spacing is generous inside groups and between hierarchy levels, but the canvas is not padded with purposeless empty space.
- Tables and dense data remain readable at 1440 × 1024 and 390 × 844.
- No implementation begins before a visual direction is selected.
