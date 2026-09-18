# C20 tracker data audit

Date: 2026-09-17. Independent audit against `main` at commit `c3b15b1`. Scope:
the seven original tracker snapshots in `src/data/` —
`achievements.json`, `bestiary.json`, `bosstiary.json`, `charms.json`,
`measuring-tibia.json`, `quests.json`, `titles.json` — and the read-only
repositories that normalize them (`src/app/services/*-repository.js`). This
is a data-facts audit, not a formula audit: `tests/tracker-contracts.test.js`
already covers 36 independent semantic cases for the tracker math (Bestiary
floors, Bosstiary stage accrual, Charm currencies, CSV/JSON transfer, undo).
This report and its companion `tests/data-integrity.test.js` do not repeat
that work; they check the bundled data itself — identities, thresholds,
costs, cross-dataset joins, source metadata, and whether foreign per-record
progress fields are actually inert.

Everything below was verified by reading the shipped JSON directly (see the
corresponding test in `tests/data-integrity.test.js` for the exact
assertion). Two findings (#2 and #4) were also fixed, narrowly, in the one
repository each affected (`measuring-tibia-repository.js`,
`achievements-repository.js`) plus this report, `docs/data-sources.md`'s
provenance row, and the test file; no other source, dataset, or
documentation file was touched. `src/data/hunt-grounds.json`,
`imbuements.json`, `market-watch.json`,
`public-history.json` and `world-changes.json` are out of scope — they
belong to other in-flight work (C07, C09, C11, C13, public-data pipeline)
and are not part of the original seven trackers.

## What holds up

- **Identities.** All 833 Bestiary creatures, 316 bosses, 25 charms, 570
  achievements, 237 quests, 113 titles, and 171 Measuring Tibia subareas
  have unique, non-blank ids and names. No dataset has a duplicate.
- **Bestiary thresholds.** Every creature satisfies `Stage 1 <= Stage 2 <=
  Kills to Unlock`, with a positive unlock target, across all 833 rows.
- **Bosstiary thresholds.** Every boss's Prowess/Expertise/Mastery kill
  thresholds strictly increase, and the three stage point values sum
  exactly to the boss's published `total_boss_points`, across all 316 rows.
- **Charm costs.** Every charm has exactly three stages whose costs sum
  exactly to its published `total_cost`, across all 25 charms. Every
  charm's effect text carries the `{{}}` placeholder the UI interpolates.
- **Cross-dataset join: Measuring Tibia → Achievements.** All 20 area
  achievement names referenced by `measuring-tibia.json` resolve to a real
  `achievements.json` entry, and each one is actually categorized
  `Cyclopedia Map` upstream. The dataset's own doc comment — "147 of 171
  subareas are also Bestiary location names" — is exactly correct now that
  the join is trimmed and case-insensitive (see defect #2, now resolved).
- **Bundled counts match the README.** 570 achievements, 833 creatures, 316
  bosses, 25 charms, 20 areas / 171 subareas, 237 quests, 113 titles all
  match the README's "Bundled datasets" table.
- **Foreign progress fields are inert today.** Every dataset that carries a
  personal-account artifact (`user_data` per Bestiary creature,
  `user_details` on Bestiary/Bosstiary/Quests/Titles, `checked` on
  Bosstiary/Charms/Quests/Titles/Achievements) currently holds only
  zero/false values, and none of it survives the repository normalizers
  (`bestiary-repository.js` and siblings only ever read named upstream
  game-data fields). The "external snapshots never import foreign
  `user_data`...as player truth" claim in `docs/data-sources.md` holds for
  the current files.

## Defects and gaps

Two of the six defects/gaps found below (#2 and #4) were fixed in this same
pass, narrowly, in the affected service and its tests only. They are marked
**RESOLVED** and kept in this report as a record of what was wrong and how
it was verified, rather than deleted.

### 1. RESOLVED documentation — `quests.json`: the README's "94 questlogs" is a dataset artifact, not 94 real questlogs

**Severity: data-completeness, README-visible.** `README.md`'s Quests
previously stated "237 quests across 94 questlogs." The README now reports 93 named questlogs and 104 ungrouped quests, matching the runtime. In the raw dataset,
**104 of the 237 quests (44%) have a completely blank `questlog_name`,
`questlog`, and `questlog_id`** — not a display-only gap, the source
record itself has no questlog association. The number of quests that
actually share a real, named questlog is only **93**. "94" only balances
by counting the blank/"Ungrouped" bucket as if it were a 94th questlog.

The app's own `questsTracker.totals()` already treats blank as excluded
(`new Set(rows.map(r => r.questlog).filter(Boolean))`), so the in-app "X of
Y questlogs finished" stat will report **93**, one below the README's
figure — the two numbers actively disagree today. This is worth an
explicit call-out wherever "94 questlogs" is claimed (README, this repo's
docs), or a source re-check to see whether TibiaDraptor's export is simply
missing questlog attribution for a huge share of standalone treasure/item
quests (a plausible, but currently unverified, explanation).

Locked in `tests/data-integrity.test.js`: *"104 of 237 quests carry no
questlog at all, leaving only 93 real questlogs."*

### 2. RESOLVED — `measuring-tibia.json` vs. `bestiary.json`: a casing mismatch broke the Bestiary-location join for one subarea

**Severity (as found): data defect, silently degraded to a "no spawns"
reading.** The subarea is stored as `"Venore Dragon lair"` (lowercase
"lair"). Four Bestiary creatures — Dragon, Dragon Lord, Dragon Hatchling,
Dragon Lord Hatchling — list `"Venore Dragon Lair"` (capital "Lair") as a
location. The join in `measuring-tibia-repository.js`
(`countCreaturesByLocation` / `creatureCounts.get(subarea)`) was an exact
string match, so this one subarea's `creatureCount` came out `null` —
indistinguishable from a genuine city/interior area with no spawns (the
other 24 unmatched subareas), when it should read `4`. Every other name in
the 25-subarea "no match" set is a real interior/city location or a
granularity mismatch (e.g., `Isle of Ada` is one Bestiary location but
three separate subareas) — this was the one case that was an outright
spelling inconsistency between the two files rather than an inherent limit.

**Fix.** `measuring-tibia-repository.js` now builds and looks up the
location join on a trimmed, lower-cased key instead of the raw string, so
`"Venore Dragon lair"` and `"Venore Dragon Lair"` match. The subarea's own
`Name` — the identity player progress is recorded against — is left
untouched (still `"Venore Dragon lair"`, exactly as `measuring-tibia.json`
spells it); only the join key is normalized, not the canonical name shown
to the player or written back to storage. No other dataset name is close
enough to collide under this normalization, so no other join result moved.

Locked in `tests/data-integrity.test.js`: *"the 'Venore Dragon lair'
subarea joins the Bestiary locations that describe the same place despite
differing case"* now asserts `creatureCount === 4`, and *"the
Bestiary-location join reaches 147 of 171 subareas"* replaces the old 146
figure.

### 3. `bestiary.json` is the one dataset with no source metadata at all

**Severity: provenance gap, also a documentation mismatch.** All six other
tracker files (`achievements`, `bosstiary`, `charms`, `measuring-tibia`,
`quests`, `titles`) carry `source`, `sourceName`, and a `capturedAt` date
(`2026-08-11` for all six). `bestiary.json` has none of the three — its
top level is TibiaDraptor's raw paginated-API scaffolding instead
(`links`, `meta`, `viewing_total_points`, `viewing_total_monsters`,
`viewing_total_echo_warden_charm_points`, `user_details`).

RESOLVED — `docs/data-sources.md` previously described Achievements,
Bestiary, Bosstiary, Charms, Quests, and Titles as one row with "original
retrieval date not embedded." That statement was only true for Bestiary;
the other five do embed a `capturedAt` retrieval date. The manifest now
splits this into two rows: Achievements/Bosstiary/Charms/Quests/Titles
carry `capturedAt: 2026-08-11`, while Bestiary — the largest of the seven
tracker files (833 creatures, 1.05 MB) — is called out on its own row as
the one snapshot with no embedded retrieval evidence at all.

Locked in `tests/data-integrity.test.js`: *"bestiary.json is the one
dataset with no source/sourceName/capturedAt at all"* and *"six of the
seven bundled snapshots carry source/sourceName/capturedAt provenance."*

### 4. RESOLVED — Achievements: community rarity carried its own older, silently-discarded freshness date

**Severity (as found): source-fact freshness distinct from import
freshness.** 555 of the 570 achievements carry a
`completion_stats.last_aggregated_at` of exactly `2026-05-12 01:07:35` —
one shared upstream aggregation run, about three months before the file's
own `capturedAt` (`2026-08-11`), and over four months before today
(2026-09-17). `achievements-repository.js`'s `normalizeAchievement` read
`stats.rarity` and `stats.percentage` but never carried
`last_aggregated_at` through, so nothing in the tracker row, the
Achievements card, or its `rarityLabel`/`rarityPercent` fields told the
player that the "community rarity" figure was a substantially older fact
than the rest of the record. This is exactly the "source facts dates vs.
freshness" distinction `docs/data-sources.md` already flags at the dataset
level ("Import dates describe Bestie's import work, not independent
verification...") — but here the gap was one level deeper: even within one
already-imported file, one specific field (rarity) has its own older,
independently-dated source fact that the import was silently flattening to
look as current as everything else.

The 15 achievements with no `completion_stats` at all (e.g. *Echo
Conqueror*, *Radiant Nimbus*, *Six Steps Ahead*) were already handled
correctly — `rarity`/`rarityPercent` land on `""`/`null`, which the
tracker already renders as absent rather than inventing a value; that
`null` (never `0`) behavior is unchanged by this fix.

**Fix.** `normalizeAchievement` now carries `completion_stats.last_aggregated_at`
through as `rarityObservedAt` (`null` when there is no `completion_stats`
block at all), so the aggregation date survives normalization under its own
name instead of being discarded.

Locked in `tests/data-integrity.test.js`: *"community rarity's own older
aggregation date survives normalization as rarityObservedAt"* (asserts
`rarityObservedAt === "2026-05-12 01:07:35"` for the 555 affected rows and
`null` for the other 15), and *"a missing community percentage normalizes
to null, never a misleading zero"*.

### 5. OPTIONAL — seven "Bestiary"-category achievements are structurally derivable but have no cross-dataset join, and the source data lacks the structured fields to build one

**This is an optional enhancement, not a confirmed requirement.** Nothing
in the README, `docs/data-sources.md`, or `project-completion.md` commits
Bestie to deriving these seven achievements automatically; the only
documented derivation promise is the Measuring Tibia → Achievements join
already covered by defect note #1 above. What follows records that the
same *shape* of derivation would be technically possible here too, for
whoever later decides whether it's worth building — it should not be read
as a defect the app currently owes.

**Severity: data-completeness gap for a documented pattern, if adopted.** README states
"Achievements awarded by completing Measuring Tibia areas are derived
automatically instead of being recorded twice," and that pattern is real —
`measuring-tibia.js` declares `deriveExternalDone`, consumed by
`achievements.js` through `context.externalDone`. Seven achievements in
the `Bestiary` category are the same shape of fact, just against a
different tracker:

| Achievement | Points | Requirement (spoiler) |
|---|---:|---|
| Hunting Permit | 1 | Unlock all details from any monster in your Bestiary |
| Little Adventure | 1 | Unlock all details from 10 easy monsters |
| Little Big Adventure | 2 | Unlock all details from 100 easy monsters |
| Contender | 3 | Unlock all details from 10 medium monsters |
| Serious Contender | 4 | Unlock all details from 100 medium monsters |
| Skilled Hunter | 5 | Unlock all details from 10 hard monsters |
| Master Hunter | 6 | Unlock all details from 100 hard monsters |

`bestiary.json`'s own `Difficulty` field comfortably supports these
thresholds (173 Easy, 310 Medium, 213 Hard creatures — all well past the
10/100 marks the achievements name), and the tracker already computes
per-creature completion (`isComplete`). But two things are missing at
once: no tracker declares `derivesFor`/`deriveExternalDone` against
Bestiary the way Measuring Tibia does, **and** `achievements.json` itself
has no structured count/difficulty pair for these seven — the threshold
only exists as free text in `spoiler`. Wiring this join would need either
a small hand-authored mapping (seven rows, low risk of drift since Bestiary
difficulty tiers are stable) or a source that publishes the threshold as
data rather than prose. Today, recording any of these seven is entirely
manual and untouched by actual Bestiary progress, unlike the 20 Cyclopedia
Map achievements.

Locked in `tests/data-integrity.test.js`: *"seven Bestiary-category
achievements read like Measuring-Tibia-style derived facts but have no
cross-dataset join or structured threshold."*

### 6. Minor completeness notes (not defects, recorded for completeness)

- **Bosstiary combat metadata is 100% absent.** `hitpoints`/`experience`
  are `null` for all 316 bosses. Nothing in the current Bosstiary tracker
  or README claims these values, so this is not a broken promise — only
  worth knowing before any feature (e.g. a boss-aware Elemental Damage
  extension) is designed against this file.
- **11 quests have an empty `rewards` string** (e.g. *The First Dragon*,
  *Shards of a Broken Moon*, *The Way of the Monk*) — all read like
  narrative-only questlines rather than a data-entry gap, but this was not
  independently verified against the live game.
- **`Areas of Effect`** is a 21st achievement typed `Cyclopedia Map` upstream
  (a 1-million-gold donation reward, unrelated to area discovery) that is
  correctly *not* wired into the Measuring Tibia join — confirms the join
  is keyed on the 20 real area names, not the category label, which is the
  safer design.
- Two Measuring Tibia areas canonicalize their achievement name from a
  differently-spelled upstream source name via `achievementSourceName`
  (`Southern Darama` → "Mummy's Dearest"/"Mummys Dearest", `Tiquanda` →
  "King Of The Jungle"/"King of the Jungle"), exactly as
  `measuring-tibia.json`'s own `note` field describes. No defect found
  here — recorded because it is exactly the kind of quiet cross-dataset
  spelling drift that produced defect #2 above, and it is confirmed
  handled correctly for these two.

## Verification

```text
node --test tests/data-integrity.test.js   # 21/21 pass
node --test tests/*.test.js                # 337/337 pass (baseline 316 + 21 data-integrity)
```

Defects #2 and #4 were fixed narrowly in `measuring-tibia-repository.js` and
`achievements-repository.js` respectively, plus this report and
`tests/data-integrity.test.js`. No other source file, dataset, or
documentation was modified as part of this audit; `docs/data-sources.md`'s
provenance row was also corrected to match defect #3's finding.
