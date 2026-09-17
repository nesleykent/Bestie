# Calculator contracts

Checked 2026-09-17. Engines are independently implemented in `src/app/features/calculators.js`; tools use the existing character workspace and never update tracker progress.

## XP and level

Total XP at level L is `50 × (L³ − 6L² + 17L − 12) / 3`, with level 1 requiring 0 XP. The inspected [tibia-xp-history formula module](https://github.com/mathiasbynens/tibia-xp-history/blob/5a10524cde4bbad6289e4f7d9eba4473c2995920/formulae.mjs) supplies formula evidence. Bestie computes the polynomial with BigInt and finds inverse levels by integer binary search, avoiding floating-point errors at boundaries. Public results are limited to JavaScript safe integers. Tests independently accumulate the per-level difference `50L² − 150L + 200` through level 1000 and check published table examples.

Remaining time is remaining XP / observed XP per hour. Missing or zero rates produce unavailable time unless the target is already reached. Optional exact total XP overrides the level-start approximation. Bonuses are not inferred or multiplied twice.

## Stamina

Offline recovery uses 3 minutes per stamina minute until 39 hours, then 6 until 42. A fresh logout includes 10 minutes before regeneration; the input explicitly lets a player reduce the remaining delay to 0 when already resting. A planned hunt consumes one minute of stamina per active minute; recovery is projected from the remaining stamina. The tool also reports available hunting time, time above 39:00, and any planned time beyond exhaustion. No online regeneration or reward-streak assumptions are applied.

Sources inspected: [TibiaPal stamina calculator](https://github.com/PawelKusnierek/TibiaPal/blob/899d3720e46c36e0eb9e35c6147bf4191ccc69cd/scripts/stamina.js) for the 3/6 thresholds; [exiva-xp planning engine](https://github.com/nesleykent/exiva-xp/blob/1d65728c7f3a720972d5b8c6be7085c6ca32c9bf/assets/js/engine/planning.js) for the explicit 10-minute delay. No implementation copied. The [official Tibia support entry](https://www.tibia.com/support/?entryid=75&subtopic=gethelp) was also investigated; direct automated access returns HTTP 403, so it is not claimed as a freshly read validation source.

Examples: 39:00→42:00 takes 18h10m; 38:30→39:30 takes 4h40m; 00:00→42:00 takes 135h10m including fresh delay. The ready time uses the device clock at calculation time, rather than a background alarm.

## Elemental damage

Uses `hitpoints`, `experience` and `resistances` from Bestie's existing TibiaDraptor Bestiary snapshot (`src/data/bestiary.json`). Foreign `user_data` remains ignored. Resistance values are percentages of damage received: adjusted damage = base component × percentage / 100. Missing values remain unknown. A zero component does not require resistance evidence to sum other components.

The tool reports elemental adjustment of an entered attack, not a full combat simulator. Armor, mitigation, shielding, critical hits, charms, skill/vocation formulas, and client rounding are excluded explicitly. Toad's actual bundled values independently verify physical 100 + fire 100 + earth 100 → 100 + 110 + 80 = 290. Creature metadata is a snapshot, not a promise of live game freshness; see the consolidated source manifest for refresh status.
