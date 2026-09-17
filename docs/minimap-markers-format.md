# Local minimap markers

Implemented in Tools → Minimap Markers. Choose a personal binary/JSON file and an optional community file, inspect the merge, then download binary, JSON, an original-byte backup, or a detailed report. Files remain in memory for this page visit; no upload or automatic write to the Tibia folder occurs. Input files are capped at 10 MB. Unsupported input blocks all export actions until corrected.

## Sources and scope

Independent implementation based on the inspected [tibia-maps-merge format implementation](https://github.com/nesleykent/tibia-maps-merge/tree/6994248e1ea9224487f713eed8b53233d5db2df1) (`docs/lib/markers.js`, `docs/lib/constants.js`, and Python equivalents). That project has no license file; its source implementation was not copied. The [primary TibiaMaps format guide](https://tibiamaps.io/guides/minimap-file-format#map-marker-data) was read on 2026-09-17. Its published Fury Gate hexdump is an independent byte fixture, verified for coordinates 32270,32171,7, icon `!`, and exact binary roundtrip.

This supports the three-byte coordinate layout used by official-server markers and the reference converter. The primary guide also describes shorter coordinates for positions outside the official map; those encodings are not accepted. There is no file-level header/version in this format. The reference converter permits a mathematical coordinate range 0…4194303; Bestie applies the same numeric bounds, but compatibility with a client outside real map coordinates has not been validated. Unicode is preserved by the converter; individual client versions may restrict accepted characters.

A record has tag `0A`, one-byte payload size, coordinate block `0A 0A`, x tag `08` plus 3 coordinate bytes, y tag `10` plus 3 bytes, floor tag `18` and floor, icon tag `10` and icon, description tag `1A` plus UTF-8 byte length and bytes, then `20 00`. The payload size is 18 plus description byte count, including the terminator. Coordinates decode as `b0 + 128*b1 + 16384*b2 − 16512`. The writer uses the inverse demonstrated in the primary guide for three-byte coordinates.

The parser bounds-checks every field and rejects invalid tags, invalid UTF-8, unknown icons, floors outside 0…15, or descriptions over 100 bytes. Following the reference's documented client trailing-byte quirk, it resynchronizes after each complete description rather than requiring a clean terminator or trusting the outer size byte. A corrupt file cannot be assumed pristine merely because it parses; the original backup is byte-for-byte preserved regardless of conversion normalization.

## JSON and merge rules

JSON is an array of `{x, y, z, icon, description}` objects. The 20 icon strings are the community format identifiers: `checkmark`, `?`, `!`, `star`, `crossmark`, `cross`, `mouth`, `spear`, `sword`, `flag`, `lock`, `bag`, `skull`, `$`, `red up`, `red down`, `red right`, `red left`, `up`, `down`. Unknown/null icons and invalid Unicode are rejected before preview.

Parsing preserves file order and duplicates. Merge keys are the exact coordinate triple `(x,y,z)`; personal wins over community. The last occurrence within each input wins. Every shared coordinate is included in the report, including identical records. Output is stably ordered by floor, x, then y. No input array is mutated. UI preview shows up to 50 conflicts; the downloadable report includes all.

## API

- `parseMarkerBinary(ArrayBuffer | Uint8Array, {source}?) → Marker[]`
- `writeMarkerBinary(Marker[]) → Uint8Array`
- `parseMarkerJson(text) → Marker[]`
- `mergeMarkers(personal, community) → {markers, summary, conflicts}`

Both merge arguments must be validated marker arrays (`[]` explicitly means no source). Summary includes input counts, within-input duplicate counts, merged count, shared-coordinate count and identical count. Conflicts contain coordinates, personal/community records and an `identical` flag. All conversions throw on unsupported fields before returning output.

Tests cover independent wire bytes, truncation, malformed inputs, Unicode, source ordering, exact community identifiers, merge priority, duplicates and the published hexdump. Runtime validation additionally checks backup/download bytes and invalid-input export blocking. Live client installation is manual and is not claimed as automated verification.
