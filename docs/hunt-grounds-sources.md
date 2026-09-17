# Hunt Grounds and Hunt Planner

Tools → Hunt Planner consumes the complete current TibiaPal hunting tables at revision `899d3720e46c36e0eb9e35c6147bf4191ccc69cd`: 155 knight, 177 paladin, 168 monk, 164 sorcerer, 163 druid and 53 team entries (880 total). The dataset is a snapshot of that curated reference, not a live promise. Superseded `hunting_old` tables are excluded.

Source: [TibiaPal repository](https://github.com/PawelKusnierek/TibiaPal/tree/899d3720e46c36e0eb9e35c6147bf4191ccc69cd), `_data/hunting/`, and `hunting.html`. The original MIT license is retained in `third-party/TibiaPal-LICENSE.txt`. No exiva-xp data or implementation was copied.

## Import and validation

Run `node scripts/import-hunt-grounds.mjs /path/to/TibiaPal` from Bestie's root after checking out the intended source revision. This deterministic projection preserves place names, level minima, vocation, solo/team distinction, published combat context, raw experience rate and profit rate strings, and meaningful video links. IDs are derived from source identity, not row position. A duplicate identity stops import. Empty YouTube placeholders become null. Review source revision and diff before committing the resulting snapshot.

`tests/hunt-planner.test.js` validates every current source row, unique identity, rate syntax and level minima. Missing `-`/blank rates remain null; zero and negative profit remain numeric. Source column `loot` is described by its own page as market-based **profit** on established worlds. Bestie exposes that assumption instead of presenting it as guaranteed gross loot or profit in the player's world. Source team composition/access requirements are not invented.

## Comparisons

Filters support character level, vocation (promoted vocations normalize to base vocation), solo/team, and text context. A level minimum does not prove a hunt is safe for a character. Objective is raw XP/h or profit/h; unknown rates sort after all known values, including losses.

Players explicitly link saved processed sessions to a ground/vocation entry. Matching names alone never creates a link. Measured ranking uses the duration-weighted rate across linked sessions in the selected regular/rapid mode. Invalid or missing measurements are excluded. Source reference rates are displayed and ranked separately from measured evidence; they never feed Bestiary or Task creature kill-rate calculations. Draft edits do not alter processed session evidence.

Filters and links are stored with the active local character in tool inputs and full backups. The comparison is paginated in groups of 25; all filtered rows remain accessible. Empty/missing evidence is useful setup guidance, not a fabricated estimate.
