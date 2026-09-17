# Morning Tibia sources and behavior

Implemented at Tools → Morning Tibia (`#tools/morning`). Paste World Board and Guide dialogue with an observed world and date. Results use a separately saved processed observation; draft edits and invalid reprocessing do not change it. Manual per-change corrections are labelled, stored locally with the character, and reset on a new processed observation. This is an observation log, not a live world-state feed.

## Snapshot provenance

Imported 2026-09-17 from [nesleykent/morning-tibia revision 54728ed4cd06d76392e9f982c12cb297bd551bb0](https://github.com/nesleykent/morning-tibia/tree/54728ed4cd06d76392e9f982c12cb297bd551bb0). The import date does **not** claim that every wiki page or live game message was rechecked that day. Source files:

- `lib/defaults/worldChanges.ts` and `miniWorldChanges.ts`: 14 World Changes and 26 Mini World Changes, identifiers, states, variants and detection methods.
- `lib/parser/guideMessages.ts`: 48 Guide replies, wording alternatives, state mappings, and five `unverifiedWording` flags.
- `lib/parser/boardMessages.ts`: World Board preamble and messages mapped to changes. Merchant hints are excluded from this feature.

Primary review replaced the initial hand-transcribed dataset with a direct projection of those source exports. No uncertainty flags or documented states are dropped. The parser is independently implemented using the reference's normalization and latest-reply behavior. The reference MIT copyright/permission notice is included at `third-party/morning-tibia-LICENSE.txt`.

## Data attribution

The reference attributes its game transcripts to [TibiaWiki World Changes](https://tibia.fandom.com/wiki/World_Changes), [The World Board](https://tibia.fandom.com/wiki/The_World_Board), [TibiaWiki BR Mini World Changes](https://www.tibiawiki.com.br/wiki/Mini_World_Changes), and community Guide recordings in [s2ward/tibia](https://github.com/s2ward/tibia). Those are upstream attributions, not claims that Bestie independently re-recorded the game. Wiki-derived catalog text retains its CC BY-SA attribution/share-alike terms; it is separate from the MIT code notice. Tibia game text belongs to CipSoft GmbH. Snapshot provenance is also embedded in `src/data/world-changes.json`.

## Evidence rules

- A complete board is indicated by its fixed preamble, or by the user asserting a full reading with at least one recognized board message. Empty/unrecognized text plus a checkbox cannot mark the world inactive.
- Complete-board absence only applies to announced changes. Silent and always-active changes remain unknown without direct evidence. A fragment never proves an absence.
- Board variants are only assigned when the source wording actually names one; conflicting variants are reported.
- Guide evidence must be a Guide speaker line or a standalone known reply. Player chatter and arbitrary mid-sentence quotations are excluded. The latest matching reply wins.
- Five upstream unverified wordings produce **tentative** results and a diagnostic. They never become confirmed known states.
- Manual corrections express the player's observation and remain distinct from parsed evidence. Reprocessing new text resets them.

Tests cover all states being declared, partial/full/empty/malformed board cases, variants, Guide prefixes and alternate wording, latest reply, chatter exclusion, all five tentative messages, and independent draft/processed UI behavior. Towncryer and merchant tracking are optional extensions, not included here.
