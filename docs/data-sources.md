# Bestie source manifest

Sources are read-only metadata. User progress, sessions, corrections, and tool inputs live in separate browser workspaces. External snapshots never import foreign `user_data`, charm `stage`, or `checked` fields as player truth.

| Data / capability | Source and snapshot | License / provenance | Update contract |
|---|---|---|---|
| Achievements, Bosstiary, Charms, Quests, Titles | Existing TibiaDraptor API exports in `src/data/`; each file embeds its own `capturedAt` snapshot date, `2026-08-11` | TibiaDraptor attribution retained in app/README; game content belongs to CipSoft. Exact upstream dataset redistribution terms require source review; no new foreign progress imported | Audit source identity, metadata and semantic thresholds before replacing snapshots; do not treat import date as live freshness |
| Bestiary | Existing TibiaDraptor API export in `src/data/bestiary.json`; original retrieval date **not** embedded (the one snapshot with no `capturedAt`) | Same TibiaDraptor attribution and redistribution caveats as above | Same audit contract as above; treat as unknown-freshness until a `capturedAt` is added to the file |
| Measuring Tibia | Existing Tibiopedia.pl area/subarea dataset; embedded `capturedAt: 2026-08-11` | Existing attribution retained; source-specific relationship evidence documented in entity-context tests | Preserve subarea identities and area-achievement joins |
| Hunt Grounds | [TibiaPal](https://github.com/PawelKusnierek/TibiaPal/tree/899d3720e46c36e0eb9e35c6147bf4191ccc69cd), current six hunting tables, 880 entries | MIT; `third-party/TibiaPal-LICENSE.txt` | Reproducible `scripts/import-hunt-grounds.mjs`; [contract](hunt-grounds-sources.md) |
| World Board / Guide catalog | [morning-tibia](https://github.com/nesleykent/morning-tibia/tree/54728ed4cd06d76392e9f982c12cb297bd551bb0), 14 World Changes / 26 Mini World Changes / 48 Guide replies | MIT code notice; separate upstream Wiki CC BY-SA transcript attribution; five unverified wording flags retained | [Source and evidence contract](morning-tibia-sources.md); preserve source variants/uncertainties |
| XP, stamina, elemental interaction | Mathematical formulas and Bestie's existing creature combat metadata | Independent implementations; no unlicensed reference code copied | [Formula contracts and exact references](calculator-sources.md) |
| Minimap binary and JSON | [TibiaMaps format guide](https://tibiamaps.io/guides/minimap-file-format), inspected tibia-maps-merge revision `6994248e1ea9224487f713eed8b53233d5db2df1` | Independent implementation of file-format facts; reference implementation has no license file | [Supported format and limits](minimap-markers-format.md); primary published byte fixture and non-destructive downloads |
| Imbuements | 24 types; official fee change and community recipe references | Independently implemented rules and factual catalog, per-source caveats preserved | [Source contract](imbuements-sources.md); audit recipes/fees before updates |
| Public History / Market | Generated TibiaData / TibiaMarket observations, empty until configured | Source timestamps and identity retained; no browser tokens or foreign private records | [Pipeline contract](public-data.md); scheduled collection with fixture validation |

Import dates describe Bestie's import work, not independent verification of every source claim against the live game. Reference rates are observations with unknown character/world/gear conditions. Missing combat values or market observations must remain unavailable.

The semantic dataset audit is recorded in [tracker-data-audit.md](tracker-data-audit.md) and tracked as C20 in [project-completion.md](project-completion.md); this manifest does not itself establish that every existing snapshot is complete or current.

