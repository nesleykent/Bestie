# Public data pipeline (Character History and Market Watch)

Implements the README roadmap's [Character History](../README.md#character-history) and
[Market Watch](../README.md#market-watch) data expansion (completion ledger C08/C09): a
repository-configured, automatically refreshed pair of generated snapshots, kept entirely separate
from browser-local tracking and Session History. This document is the exact contract for that
pipeline and its rendered Data views.

## Files

| File | Role |
|---|---|
| `config/public-data.json` | Repository identity configuration: which character (if any) and which Market items to track. Edited by hand, never written by automation. |
| `scripts/update-public-data.mjs` | One-shot Node script that reads the config, calls TibiaData and TibiaMarket.top, and rewrites the two generated snapshots in place. Its orchestration is exported as `runUpdatePublicData()`, with every side effect (fetch, file paths, current time, the Market token, logging) injectable; the bottom of the file is only a thin CLI entry point guarded so importing the module never itself triggers a run. |
| `src/app/features/public-data.js` | Pure, dependency-free adapters, reconciliation, and freshness/retrieval functions. No network access. Shared by the script, Data views and Imbuements. |
| `src/data/public-history.json` | Generated Character History snapshot. |
| `src/data/market-watch.json` | Generated Market Watch snapshot. |
| `.github/workflows/public-data.yml` | Scheduled/on-demand GitHub Action that runs the script, runs the full test suite against the result, and commits only the two generated files. |

## Configuring a character and Market items

`config/public-data.json`:

```json
{
  "schemaVersion": 1,
  "character": { "name": "" },
  "market": { "items": [] }
}
```

- `character.name`: exact Tibia character name to track. **Blank by default** — no character is
  configured out of the box. A blank/whitespace-only name is a fully supported "unconfigured" state:
  the pipeline makes no network requests and leaves `public-history.json` in its default shape.
- `market.items`: array of `{ "id": <TibiaMarket numeric item id>, "name": "<display name>" }`. Empty
  by default. Items need a resolvable World to be looked up, which comes from `character.name` (see
  below) — Market Watch cannot run without a configured character even if items are listed.

Configuration is validated before any network call or write. Invalid shapes, unsupported schema versions and duplicate or invalid item IDs are rejected, preserving existing observations. A missing configuration file makes no changes; an explicitly blank character disables collection and clears the configured identity's generated snapshot. Git history retains earlier committed snapshots.

## Data sources and exact requests

### TibiaData (character identity, World, deaths, exact experience)

Base URL: `https://api.tibiadata.com/v4` (the documented public TibiaData v4 instance).

- `GET /character/{name}` — resolves `character.character.{name, world, level, vocation, sex, title,
  residence, achievement_points, last_login, account_status}` and `character.deaths[]
  {time, level, reason}`. This is the **only** source of the character's World; nothing in this
  pipeline is told a World directly by config.
- `GET /highscores/{world}/experience/all/{page}` — exact experience and rank are read from the public highscores (up to 20 pages). The `all` vocation filter supports TibiaData's restriction mode, verified against the live API on 2026-09-18; vocation-specific requests returned error 9002. Unranked characters have no invented exact XP value. Latest rank and daily rank/level/XP observations are retained.

**Only the overall experience highscore is tracked.** Other TibiaData highscore categories (skills,
achievements, loyalty, etc.) are not fetched, to keep the pipeline's request volume and one scheduled
run's duration bounded. Every run that finds the character's rank writes it into both
`history[day].experience` (the per-day series) and `highscores.experience` (the character's *current*
rank/level/value as of this run, via `withHighscoreCategory()`) — the current standing and the daily
series are both derived from the same lookup, so neither is stale relative to the other.
`parseHighscoreEntry()` rejects a response whose reported World doesn't match the World it was
requested for (including one that omits the World field entirely — a missing World is treated as
unverifiable, not as a pass) and rejects a rank/level/value that isn't a finite, non-negative number, so
a malformed or wrongly-scoped highscores page can never produce a fabricated reading.

### TibiaMarket.top (selected Market item prices)

- `GET https://api.tibiamarket.top/item_history?server={world}&item_id={id}&start_days_ago=30&end_days_ago=-1`
- Requires `Authorization: Bearer <token>`. The token is read **only** from the `TIBIA_MARKET_TOKEN`
  environment variable (in CI, `secrets.TIBIA_MARKET_TOKEN`). **No token is bundled in source or ever
  sent from a browser.** If `TIBIA_MARKET_TOKEN` is unset, Market requests are skipped (logged,
  not an error). Identity and item selection are still reconciled, so obsolete quotes are removed;
  matching last-known quotes remain available with their original source timestamps.
- Each history row is `{ time (unix seconds), is_full_data, sell_offer, day_lowest_sell,
  day_average_sell, ... }`. The array is **not assumed to be in timestamp order** —
  `selectLatestMarketPrice()` explicitly finds the row(s) with the greatest `time`. A `time` so large it
  would overflow JavaScript's `Date` range is dropped as malformed, same as a non-finite one. Rows tying
  on `time` break deterministically by content (full-data first, then the highest available
  offer/lowest/average price) — never by input array position — so the result never depends on array
  order even when two rows are equally "latest". The chosen row's own best-available price is used: an
  active sell offer (`is_full_data` with a positive `sell_offer`, basis `"active-sell-offer"`) when that
  specific row has one, otherwise that same row's daily lowest (`"daily-lowest-sell"`) then average
  (`"daily-average-sell"`) sell price. A fresher row that only has a daily aggregate is never skipped in
  favor of an older row's live offer, and vice versa.

## Generated document schemas

`src/data/public-history.json`:

```json
{
  "schemaVersion": 1,
  "character": { "name": "", "world": null },
  "profile": null,
  "history": {},
  "deaths": [],
  "highscores": {},
  "checkedAt": null,
  "updatedAt": null
}
```

- `character` / `profile`: identity and the latest TibiaData character snapshot. `profile.capturedAt`
  only advances when a profile field actually changed — a distinct field, `checkedAt` (below), is what
  tells you the pipeline is still running.
- `history`: keyed by Tibia server-save day (`YYYY-MM-DD`, the day boundary at 10:00 Europe/Berlin,
  CET/CEST-aware — see `serverSaveDate()`), each value `{ level, experience, capturedAt }`. Reruns
  within the same server-save day update the row only if the reading actually changed.
- `deaths`: accumulated and de-duplicated by exact timestamp, ascending.
- `highscores`: keyed by category; currently only `experience` is populated, `{ rank, level, value,
  capturedAt }` for the character's current standing (see above) — updated only when the rank/value
  actually changed.
- `checkedAt`: the timestamp of the **last successful** character-profile fetch, full stop — it always
  advances on a successful run, whether or not anything observable changed. This is what
  `getCharacterHistorySummary()`'s freshness is based on: an idle character whose level/XP genuinely
  hasn't moved in days is "the pipeline confirmed nothing changed", not "the pipeline may be broken".
- `updatedAt`: only bumped when the document's *content* (profile fields, deaths, a day's reading, or
  the current highscore standing) actually changed — distinct from `checkedAt` above.

`src/data/market-watch.json`:

```json
{ "schemaVersion": 1, "world": null, "items": {}, "updatedAt": null }
```

- `items` is keyed by item id (string), each value `{ id, name, world, price, basis, observedAt,
  updatedAt }`. `observedAt` is the market reading's own timestamp (from TibiaMarket's `time`);
  `updatedAt` is when this pipeline happened to fetch it. Freshness (below) is based on `observedAt` —
  a stale market reading reads as stale even on a run that just completed successfully.

## Config identity separation

Both documents are namespaced to the *current* configuration, not merged across a change of identity:

- `reconcileCharacterHistory()` resets to the empty document if the configured name or the
  TibiaData-resolved World no longer matches what was previously stored — a re-pointed config starts a
  fresh history rather than blending a different character's readings into the old one's.
- `reconcileMarketWatch()` drops every stored item price if the resolved World changes, since those
  prices no longer describe a market that applies to the current configuration. Independent of a World
  change, it also drops any stored item that is no longer in the configured `itemIds` list, so removing
  an item from config actually removes its stale price rather than leaving it behind indefinitely.

Neither function ever needs a network call to make this decision: both take only the previous document
and the newly-resolved identity. Critically, that identity is only ever the World *this run* actually
resolved from TibiaData — `scripts/update-public-data.mjs` never falls back to a previously-stored
World (see "No stale-World fallback" below), so a profile-resolution failure can't cause Market Watch
to silently poll (and persist prices for) the wrong market.

### No stale-World fallback

`updateCharacterHistory()` and `updateMarketWatch()` are not independent: Market Watch is only ever
given the World Character History *just* resolved this run, never `previous.world` from a prior run.
Concretely:

- If the configured character can't be resolved this run (network failure, or TibiaData has no matching
  profile), `updateCharacterHistory()` throws, the whole run aborts, and Market Watch never runs at
  all — it does not fall back to guessing at a previously-stored World.
- If the configured character name changed since the last run, Market Watch is scoped to the *new*
  character's World as soon as it resolves, and `reconcileMarketWatch()` drops the old World's prices
  (see above) rather than continuing to serve them under a mismatched identity.

Character History's own profile fetch is reused for Market Watch's World, rather than each part making
its own independent (and potentially inconsistent) TibiaData request.

## Freshness (for UI integration)

`describeFreshness(timestamp, { now, windowMs })` returns `"fresh"`, `"stale"`, or `"unavailable"`
(missing/malformed **or future** timestamp — a timestamp ahead of `now` is clock skew or corrupt data,
not legitimately fresh) and is used by `getCharacterHistorySummary()` and `getMarketWatchSummary()`,
which are safe to call directly on the generated JSON documents (including the untouched default/empty
shape) with no network access. `getCharacterHistorySummary()` measures freshness from `checkedAt`
(falling back to `updatedAt` for documents written before `checkedAt` existed); `getMarketWatchSummary()`
measures each item's freshness from that item's own `observedAt`, not the document- or item-level
`updatedAt` (see the schema section above for why).

```js
import { getCharacterHistorySummary, getMarketWatchSummary } from "../src/app/features/public-data.js";
import publicHistory from "../data/public-history.json" with { type: "json" };
import marketWatch from "../data/market-watch.json" with { type: "json" };

const character = getCharacterHistorySummary(publicHistory);
const market = getMarketWatchSummary(marketWatch);
```

Both summaries report `configured: false` and empty/`"unavailable"` fields on the default documents,
so a page can render an honest "not configured yet" state without any special-casing.

## Setup prerequisites

- No secret is required to track Character History — TibiaData is a public, unauthenticated API.
- Market Watch requires a `TIBIA_MARKET_TOKEN` repository secret (Settings → Secrets and variables →
  Actions) if any Market items are configured. TibiaMarket.top issues read tokens for its public API;
  none is bundled with this pipeline. Without it, the workflow skips requests but still removes quotes
  invalidated by a World or item-selection change.
- `.github/workflows/public-data.yml` pushes to `main` with the default `GITHUB_TOKEN` and dispatches
  `deploy-pages.yml` directly afterward, since a `GITHUB_TOKEN` push does not itself trigger other
  push-triggered workflows.

## Corrupt files abort the run

`readJson()` inside `scripts/update-public-data.mjs` distinguishes an **absent** file from a
**present-but-corrupt** one:

- A missing config (`ENOENT`) makes no changes. A missing snapshot starts from the documented empty shape.
- A file that exists but fails to parse as JSON (or any other read error) **throws**, aborting the run
  before anything is written. A corrupt `config/public-data.json` can no longer be silently treated as a
  blank config (which would otherwise reset `public-history.json` to empty on the next run and discard
  real history); a corrupt snapshot is never quietly replaced by its defaults either.

Since `runUpdatePublicData()` is driven by a top-level `await` when run as a CLI, an aborted run exits
non-zero — in CI, that fails the workflow step before the commit step can run, so a corrupt file never
reaches `main`.

## Testing the orchestration itself

`tests/public-data-pipeline.test.js` exercises `runUpdatePublicData()` end-to-end against tempdir
fixtures with a mocked `fetchImpl` (and a no-op `sleepImpl`) — no real network access, no dependency on
the script's own CLI entry point. It covers: a no-op run with a blank/absent config making zero network
calls; partial failures (a failed highscore lookup, one failed Market item) leaving the rest of that
run's *other* readings intact and preserving the last-good value for the part that failed; a corrupt
config/history/market file aborting the run without touching any file; a missing `TIBIA_MARKET_TOKEN`
skipping Market Watch with zero TibiaMarket calls; the Market token never appearing anywhere but the
`Authorization` header; a changed configured character resetting both snapshots to the new identity
(never blending, never falling back to a stale World); and an item removed from config disappearing from
`market-watch.json` without a World change. `tests/public-data.test.js` separately, exhaustively covers
every pure function `public-data.js` exports.

## Known limitations

- Only the overall experience highscore feeds `history`/`highscores.experience`; no other TibiaData
  highscore category is currently fetched (see above).
- Exact XP requires appearance in the public experience top 1,000; absence never becomes zero or a level-derived estimate.
- `checkedAt` advancing on every successful run (see above) means a scheduled run that finds no
  observable change still rewrites and commits the snapshot — a deliberate trade-off so freshness stays
  honest for an idle character, at the cost of a commit on every scheduled run rather than only on actual
  data changes.

## Runtime views

Data → Character History shows profile freshness, the latest 30 observed XP/level/rank dates and XP differences between observations, latest experience rank, and the latest 10 observed deaths. Data → Market Watch shows World, quote basis, source observation time and per-item freshness. Empty collections explain setup. Public snapshots never replace private progress, and no source token is sent from the browser. Configuration changes invalidate removed items and mismatched Worlds even when a refresh token is unavailable.

Daily history uses the source observation time (API timestamp minus `highscore_age` minutes), mapped to the 10:00 Europe/Berlin server-save boundary. Fetching a cached pre-save highscore after server save therefore updates the previous day, not a fabricated new-day reading. If source age is unavailable, collection time is the explicitly recorded fallback.

Imbuements offers an explicit action to fill blank prices from uniquely matching, fresh quotes for the configured World. Existing manual prices remain unchanged; applied quote basis, World and time are recorded in the local draft.
