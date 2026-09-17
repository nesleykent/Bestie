import test from "node:test";
import assert from "node:assert/strict";

import {
    ICONS_BY_ID,
    ICONS_BY_NAME,
    MIN_COORDINATE,
    MAX_COORDINATE,
    MIN_FLOOR,
    MAX_FLOOR,
    MAX_DESCRIPTION_BYTES,
    parseMarkerBinary,
    writeMarkerBinary,
    parseMarkerJson,
    mergeMarkers
} from "../src/app/features/minimap-markers.js";

/*
 * Every byte array below is built by hand from the coordinate formula
 * `value = b0 + 0x80*b1 + 0x4000*b2 - 0x4080`, independently solved for each
 * fixture (see the comment above each one), not produced by calling
 * writeMarkerBinary and trusting it. This is what lets the round-trip tests
 * further down actually prove something about both directions.
 */

// x=1000 -> b0=0xE8,b1=0x87,b2=0x00 (232 + 128*135 + 0 - 16512 = 1000)
// y=2000 -> b0=0xD0,b1=0x8F,b2=0x00 (208 + 128*143 + 0 - 16512 = 2000)
// z=7, icon=sword(0x08), description="Hi" (0x48 0x69, 2 bytes) -> record length = 18+2 = 0x14
const HI_MARKER_BYTES = Uint8Array.of(
    0x0A, 0x14,
    0x0A, 0x0A,
    0x08, 0xE8, 0x87, 0x00,
    0x10, 0xD0, 0x8F, 0x00,
    0x18, 0x07,
    0x10, 0x08,
    0x1A, 0x02, 0x48, 0x69,
    0x20, 0x00
);
const HI_MARKER = { x: 1000, y: 2000, z: 7, icon: "sword", description: "Hi" };

// x=MIN_COORDINATE=0 -> b0=0x80,b1=0x80,b2=0x00 (128 + 128*128 + 0 - 16512 = 0)
// y=MAX_COORDINATE=4194303 -> b0=0xFF,b1=0xFF,b2=0xFF (255 + 128*255 + 16384*255 - 16512 = 4194303)
// z=0, icon=checkmark(0x00), description="" (0 bytes) -> record length = 18+0 = 0x12
const BOUNDARY_MARKER_BYTES = Uint8Array.of(
    0x0A, 0x12,
    0x0A, 0x0A,
    0x08, 0x80, 0x80, 0x00,
    0x10, 0xFF, 0xFF, 0xFF,
    0x18, 0x00,
    0x10, 0x00,
    0x1A, 0x00,
    0x20, 0x00
);
const BOUNDARY_MARKER = { x: 0, y: 4194303, z: 0, icon: "checkmark", description: "" };

// x=0,y=0,z=0, icon=checkmark(0x00), description="é" (UTF-8: 0xC3 0xA9, 2 bytes)
const UNICODE_MARKER_BYTES = Uint8Array.of(
    0x0A, 0x14,
    0x0A, 0x0A,
    0x08, 0x80, 0x80, 0x00,
    0x10, 0x80, 0x80, 0x00,
    0x18, 0x00,
    0x10, 0x00,
    0x1A, 0x02, 0xC3, 0xA9,
    0x20, 0x00
);
const UNICODE_MARKER = { x: 0, y: 0, z: 0, icon: "checkmark", description: "é" };

function concat(...arrays) {
    const total = arrays.reduce((sum, a) => sum + a.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const a of arrays) {
        out.set(a, offset);
        offset += a.length;
    }
    return out;
}

/* ==========================================================================
   Icon table
   ========================================================================== */

test("the icon table has 20 entries and is a true bijection", () => {
    assert.equal(ICONS_BY_ID.size, 20);
    assert.equal(ICONS_BY_NAME.size, 20);
    for (const [id, name] of ICONS_BY_ID) {
        assert.equal(ICONS_BY_NAME.get(name), id);
    }
});

test("icon names match the exact community `markers.json` identifiers, including punctuation-only ones", () => {
    // These are the exact strings used by the nesleykent/tibia-maps-merge
    // reference at commit 6994248e1ea9224487f713eed8b53233d5db2df1
    // (docs/lib/constants.js / tibiamaps/constants.py), not this module's own
    // vocabulary -- a JSON document using these must interoperate with it.
    assert.equal(ICONS_BY_ID.get(0x01), "?");
    assert.equal(ICONS_BY_ID.get(0x02), "!");
    assert.equal(ICONS_BY_ID.get(0x0D), "$");
    assert.equal(ICONS_BY_ID.get(0x0E), "red up");
    assert.equal(ICONS_BY_ID.get(0x0F), "red down");
    assert.equal(ICONS_BY_ID.get(0x10), "red right");
    assert.equal(ICONS_BY_ID.get(0x11), "red left");
    assert.equal(ICONS_BY_ID.get(0x12), "up");
    assert.equal(ICONS_BY_ID.get(0x13), "down");
});

/* ==========================================================================
   parseMarkerBinary: independently constructed bytes
   ========================================================================== */

test("parses one independently hand-built marker record", () => {
    const markers = parseMarkerBinary(HI_MARKER_BYTES);
    assert.deepEqual(markers, [HI_MARKER]);
});

test("parses a marker at each coordinate boundary and an empty description", () => {
    const markers = parseMarkerBinary(BOUNDARY_MARKER_BYTES);
    assert.deepEqual(markers, [BOUNDARY_MARKER]);
});

test("accepts a plain ArrayBuffer as well as a Uint8Array view", () => {
    const buffer = HI_MARKER_BYTES.buffer.slice(HI_MARKER_BYTES.byteOffset, HI_MARKER_BYTES.byteOffset + HI_MARKER_BYTES.byteLength);
    assert.deepEqual(parseMarkerBinary(buffer), [HI_MARKER]);
});

test("an empty file parses to an empty marker list", () => {
    assert.deepEqual(parseMarkerBinary(new Uint8Array(0)), []);
});

test("multiple records retain file order for duplicate precedence", () => {
    // Parsing must preserve source order so the last same-coordinate input wins.
    const bytes = concat(HI_MARKER_BYTES, BOUNDARY_MARKER_BYTES);
    assert.deepEqual(parseMarkerBinary(bytes), [HI_MARKER, BOUNDARY_MARKER]);
});

test("an unrecognized icon byte is rejected at parse time rather than silently losing the icon", () => {
    const bytes = Uint8Array.from(HI_MARKER_BYTES);
    bytes[15] = 0xFE; // the icon byte, not present in ICONS_BY_ID
    assert.throws(() => parseMarkerBinary(bytes), /unsupported icon byte 0xfe/i);
});

test("all source records retain order until the explicit merge resolves duplicates", () => {
    const duplicate = concat(HI_MARKER_BYTES, HI_MARKER_BYTES);
    assert.deepEqual(parseMarkerBinary(duplicate), [HI_MARKER, HI_MARKER]);

    const sameCoordinateDifferentIcon = Uint8Array.from(HI_MARKER_BYTES);
    sameCoordinateDifferentIcon[15] = 0x09; // icon byte -> "flag" instead of "sword"
    const bothKept = parseMarkerBinary(concat(HI_MARKER_BYTES, sameCoordinateDifferentIcon));
    assert.equal(bothKept.length, 2);
    assert.deepEqual(new Set(bothKept.map((m) => m.icon)), new Set(["sword", "flag"]));
});

test("Unicode text decodes exactly, byte length prefix and all", () => {
    assert.deepEqual(parseMarkerBinary(UNICODE_MARKER_BYTES), [UNICODE_MARKER]);
});

/* ==========================================================================
   parseMarkerBinary: rejecting truncated / corrupt / unsafe input
   ========================================================================== */

test("truncating anywhere before the description ends throws; an empty file and a missing terminator are both still valid", () => {
    // The two-byte 0x20 0x00 terminator is never required to resync -- see the
    // parser's own resync loop and docs/minimap-markers-format.md -- so a file
    // cut exactly at the end of the description (byte 20 of 22) is not corrupt.
    assert.deepEqual(parseMarkerBinary(HI_MARKER_BYTES.slice(0, 0)), [], "zero bytes is a legitimately empty marker file");
    for (let end = 1; end < 20; end += 1) {
        assert.throws(
            () => parseMarkerBinary(HI_MARKER_BYTES.slice(0, end)),
            /truncated|expected/i,
            `byte length ${end} should have been rejected`
        );
    }
    for (const end of [20, 21, HI_MARKER_BYTES.length]) {
        assert.deepEqual(parseMarkerBinary(HI_MARKER_BYTES.slice(0, end)), [HI_MARKER], `byte length ${end} should still parse`);
    }
});

test("a wrong field tag is rejected as corrupt structure, not silently misread", () => {
    const bytes = Uint8Array.from(HI_MARKER_BYTES);
    bytes[4] = 0x09; // the x field tag, should be 0x08
    assert.throws(() => parseMarkerBinary(bytes, { source: "corrupt.bin" }), /corrupt\.bin.*x field tag/i);
});

test("an unsupported coordinate block length is rejected rather than guessed at", () => {
    const bytes = Uint8Array.from(HI_MARKER_BYTES);
    bytes[3] = 0x0B; // coordinate block length, only 0x0A is supported
    assert.throws(() => parseMarkerBinary(bytes), /unsupported coordinate block length/i);
});

test("a description length claiming more bytes than remain in the file is rejected", () => {
    const bytes = Uint8Array.from(HI_MARKER_BYTES);
    bytes[17] = 0x7F; // description length byte, wildly larger than what actually follows
    assert.throws(() => parseMarkerBinary(bytes), /truncated/i);
});

test("garbage input that never matches a record tag is rejected on the first byte", () => {
    assert.throws(() => parseMarkerBinary(Uint8Array.of(0xFF, 0x00, 0x01)), /marker record tag/i);
});

test("a description that is not valid UTF-8 is rejected rather than silently decoded with replacement characters", () => {
    const bytes = Uint8Array.from(HI_MARKER_BYTES);
    bytes[18] = 0xC3; // first description byte: a UTF-8 lead byte...
    bytes[19] = 0x28; // ...followed by a byte that is not a valid continuation byte
    assert.throws(() => parseMarkerBinary(bytes), /invalid UTF-8 description/i);
});

test("a floor byte outside 0-15 is rejected at parse time, not just on write", () => {
    const bytes = Uint8Array.from(HI_MARKER_BYTES);
    bytes[13] = 200; // the z floor byte
    assert.throws(() => parseMarkerBinary(bytes), /floor z=200 out of range/i);
});

test("a coordinate that decodes to a negative value is rejected at parse time, not only at write/download time", () => {
    // b0=b1=b2=0 decodes to 0 + 0x80*0 + 0x4000*0 - 0x4080 = -16512.
    const bytes = Uint8Array.from(HI_MARKER_BYTES);
    bytes[5] = 0x00;
    bytes[6] = 0x00;
    bytes[7] = 0x00;
    assert.throws(() => parseMarkerBinary(bytes), /x coordinate -16512 decoded out of range/i);
});

/* ==========================================================================
   writeMarkerBinary
   ========================================================================== */

test("writes the exact independently-derived bytes for a known marker", () => {
    assert.deepEqual(writeMarkerBinary([HI_MARKER]), HI_MARKER_BYTES);
});

test("writes multiple markers sorted by floor, then x, then y, regardless of input order", () => {
    const bytes = writeMarkerBinary([HI_MARKER, BOUNDARY_MARKER]);
    assert.deepEqual(bytes, concat(BOUNDARY_MARKER_BYTES, HI_MARKER_BYTES));
});

test("rejects a coordinate outside the encodable range, and a non-integer coordinate", () => {
    assert.throws(() => writeMarkerBinary([{ ...HI_MARKER, x: MAX_COORDINATE + 1 }]), /x must be an integer between/);
    assert.throws(() => writeMarkerBinary([{ ...HI_MARKER, x: -1 }]), /x must be an integer between/);
    assert.throws(() => writeMarkerBinary([{ ...HI_MARKER, y: 12.5 }]), /y must be an integer between/);
    assert.doesNotThrow(() => writeMarkerBinary([{ ...HI_MARKER, x: MIN_COORDINATE, y: MAX_COORDINATE }]));
});

test("rejects a floor outside 0-15, even though the raw byte field could technically hold more", () => {
    assert.throws(() => writeMarkerBinary([{ ...HI_MARKER, z: MAX_FLOOR + 1 }]), /z must be an integer between 0 and 15/);
    assert.throws(() => writeMarkerBinary([{ ...HI_MARKER, z: -1 }]), /z must be an integer between 0 and 15/);
    assert.doesNotThrow(() => writeMarkerBinary([{ ...HI_MARKER, z: MIN_FLOOR }]));
    assert.doesNotThrow(() => writeMarkerBinary([{ ...HI_MARKER, z: MAX_FLOOR }]));
});

test("rejects a description over the 100-byte client limit", () => {
    const tooLong = { ...HI_MARKER, description: "x".repeat(MAX_DESCRIPTION_BYTES + 1) };
    assert.throws(() => writeMarkerBinary([tooLong]), /exceeding the 100-byte limit/);
    const exactly = { ...HI_MARKER, description: "x".repeat(MAX_DESCRIPTION_BYTES) };
    assert.doesNotThrow(() => writeMarkerBinary([exactly]));
});

test("rejects a marker whose icon has no known byte, including a parsed-as-null icon", () => {
    assert.throws(() => writeMarkerBinary([{ ...HI_MARKER, icon: "not-a-real-icon" }]), /unsupported icon/);
    assert.throws(() => writeMarkerBinary([{ ...HI_MARKER, icon: null }]), /unsupported icon/);
});

/* ==========================================================================
   Full round trips
   ========================================================================== */

test("parse -> write reproduces the original bytes exactly, for boundary values and Unicode text", () => {
    for (const bytes of [HI_MARKER_BYTES, BOUNDARY_MARKER_BYTES, UNICODE_MARKER_BYTES]) {
        assert.deepEqual(writeMarkerBinary(parseMarkerBinary(bytes)), bytes);
    }
});

test("write -> parse reproduces the original marker list exactly, for boundary values and Unicode text", () => {
    for (const marker of [HI_MARKER, BOUNDARY_MARKER, UNICODE_MARKER]) {
        assert.deepEqual(parseMarkerBinary(writeMarkerBinary([marker])), [marker]);
    }
});

test("a round trip preserves multi-byte Unicode text that was not hand-derived, using every icon", () => {
    const markers = [...ICONS_BY_NAME.keys()].map((icon, index) => ({
        x: 100 + index, y: 200 + index, z: index % (MAX_FLOOR + 1),
        icon, description: `Ω café 星 ${index}`
    }));
    assert.deepEqual(parseMarkerBinary(writeMarkerBinary(markers)), sortForComparison(markers));
});

function sortForComparison(markers) {
    return [...markers].sort((a, b) => (a.z - b.z) || (a.x - b.x) || (a.y - b.y));
}

/* ==========================================================================
   parseMarkerJson
   ========================================================================== */

test("parses a valid community-schema marker JSON document", () => {
    const json = JSON.stringify([
        { x: 1000, y: 2000, z: 7, icon: "sword", description: "Hi" },
        { x: 0, y: 0, z: 0, icon: "checkmark", description: "" }
    ]);
    assert.deepEqual(parseMarkerJson(json), [
        { x: 1000, y: 2000, z: 7, icon: "sword", description: "Hi" },
        { x: 0, y: 0, z: 0, icon: "checkmark", description: "" }
    ]);
});

test("rejects invalid JSON text with a clear error", () => {
    assert.throws(() => parseMarkerJson("{ not json"), /invalid marker JSON/);
});

test("rejects a JSON document that is not an array", () => {
    assert.throws(() => parseMarkerJson(JSON.stringify({ x: 0, y: 0, z: 0 })), /must be an array/);
});

test("rejects rows with non-integer coordinates, out-of-range floors, and wrong-typed fields", () => {
    const badX = JSON.stringify([{ x: 1.5, y: 0, z: 0, icon: "checkmark", description: "" }]);
    assert.throws(() => parseMarkerJson(badX), /entry 0: x must be an integer/);

    const badFloor = JSON.stringify([{ x: 0, y: 0, z: 16, icon: "checkmark", description: "" }]);
    assert.throws(() => parseMarkerJson(badFloor), /entry 0: z must be an integer between 0 and 15/);

    const negativeFloor = JSON.stringify([{ x: 0, y: 0, z: -1, icon: "checkmark", description: "" }]);
    assert.throws(() => parseMarkerJson(negativeFloor), /entry 0: z must be an integer between 0 and 15/);

    const badIcon = JSON.stringify([{ x: 0, y: 0, z: 0, icon: 5, description: "" }]);
    assert.throws(() => parseMarkerJson(badIcon), /icon must be a string or null/);

    const missingDescription = JSON.stringify([{ x: 0, y: 0, z: 0, icon: "checkmark" }]);
    assert.throws(() => parseMarkerJson(missingDescription), /description must be a string/);

    const notAnObject = JSON.stringify(["not an object"]);
    assert.throws(() => parseMarkerJson(notAnObject), /entry 0 is not an object/);
});

test("rejects a JSON row whose icon string is not one of the known community identifiers", () => {
    const json = JSON.stringify([{ x: 0, y: 0, z: 0, icon: "not-a-real-icon", description: "" }]);
    assert.throws(() => parseMarkerJson(json), /entry 0: unsupported icon "not-a-real-icon"/);

    // A null icon (no icon assigned) is still valid; only unknown strings are rejected.
    const nullIcon = JSON.stringify([{ x: 0, y: 0, z: 0, icon: "checkmark", description: "" }]);
    assert.doesNotThrow(() => parseMarkerJson(nullIcon));
});

test("rejects a JSON row whose description exceeds the 100-byte client limit", () => {
    const tooLong = JSON.stringify([{ x: 0, y: 0, z: 0, icon: "checkmark", description: "x".repeat(MAX_DESCRIPTION_BYTES + 1) }]);
    assert.throws(() => parseMarkerJson(tooLong), /entry 0: description is 101 bytes, exceeding the 100-byte limit/);

    const exactly = JSON.stringify([{ x: 0, y: 0, z: 0, icon: "checkmark", description: "x".repeat(MAX_DESCRIPTION_BYTES) }]);
    assert.doesNotThrow(() => parseMarkerJson(exactly));
});

test("reports the offending row index for the second entry, not just the first", () => {
    const json = JSON.stringify([
        { x: 0, y: 0, z: 0, icon: "checkmark", description: "ok" },
        { x: 0, y: 0, z: 99, icon: "checkmark", description: "bad" }
    ]);
    assert.throws(() => parseMarkerJson(json), /entry 1: z must be an integer/);
});

/* ==========================================================================
   mergeMarkers
   ========================================================================== */

test("personal wins over community at a shared coordinate, and the collision is reported as a conflict", () => {
    const community = [{ x: 1, y: 1, z: 0, icon: "flag", description: "Community" }];
    const personal = [{ x: 1, y: 1, z: 0, icon: "star", description: "My House" }];

    const { markers, summary, conflicts } = mergeMarkers(personal, community);

    assert.deepEqual(markers, personal);
    assert.equal(summary.conflictCount, 1);
    assert.equal(summary.identicalConflictCount, 0);
    assert.equal(conflicts.length, 1);
    assert.deepEqual(conflicts[0], {
        x: 1, y: 1, z: 0,
        personal: personal[0], community: community[0], identical: false
    });
});

test("an identical personal copy of a community marker is still reported as a conflict, just an identical one", () => {
    const marker = { x: 5, y: 5, z: 0, icon: "flag", description: "Community" };
    const { summary, conflicts } = mergeMarkers([{ ...marker }], [{ ...marker }]);
    assert.equal(summary.conflictCount, 1);
    assert.equal(summary.identicalConflictCount, 1);
    assert.equal(conflicts[0].identical, true);
});

test("markers unique to either side pass through untouched, with no conflict recorded", () => {
    const community = [{ x: 1, y: 1, z: 0, icon: "flag", description: "Community only" }];
    const personal = [{ x: 2, y: 2, z: 0, icon: "star", description: "Personal only" }];

    const { markers, summary, conflicts } = mergeMarkers(personal, community);

    assert.deepEqual(new Set(markers), new Set([...personal, ...community]));
    assert.equal(summary.conflictCount, 0);
    assert.equal(conflicts.length, 0);
    assert.equal(summary.mergedCount, 2);
});

test("within-list duplicates at the same coordinate are resolved deterministically: the last entry in the array wins", () => {
    const community = [
        { x: 1, y: 1, z: 0, icon: "flag", description: "First" },
        { x: 1, y: 1, z: 0, icon: "star", description: "Second" },
        { x: 1, y: 1, z: 0, icon: "lock", description: "Third" }
    ];
    const { markers, summary } = mergeMarkers([], community);

    assert.equal(summary.communityDuplicates, 2);
    assert.equal(markers.length, 1);
    assert.equal(markers[0].description, "Third");

    // Running it again on the same input is exactly as deterministic.
    assert.deepEqual(mergeMarkers([], community).markers, markers);
});

test("personal-side duplicates are also resolved by last-wins before the community merge happens", () => {
    const personal = [
        { x: 1, y: 1, z: 0, icon: "flag", description: "Old personal" },
        { x: 1, y: 1, z: 0, icon: "star", description: "New personal" }
    ];
    const community = [{ x: 1, y: 1, z: 0, icon: "lock", description: "Community" }];

    const { markers, summary } = mergeMarkers(personal, community);

    assert.equal(summary.personalDuplicates, 1);
    assert.equal(markers.length, 1);
    assert.equal(markers[0].description, "New personal");
});

test("summary counts are consistent with the inputs across a mixed merge", () => {
    const community = [
        { x: 1, y: 1, z: 0, icon: "flag", description: "Shared, community version" },
        { x: 2, y: 2, z: 0, icon: "lock", description: "Community only" }
    ];
    const personal = [
        { x: 1, y: 1, z: 0, icon: "star", description: "Shared, personal version" },
        { x: 3, y: 3, z: 0, icon: "bag", description: "Personal only" }
    ];

    const { markers, summary, conflicts } = mergeMarkers(personal, community);

    assert.equal(summary.personalCount, 2);
    assert.equal(summary.communityCount, 2);
    assert.equal(summary.mergedCount, 3, "shared coordinate collapses to one entry");
    assert.equal(summary.conflictCount, 1);
    assert.equal(markers.length, 3);
    assert.equal(conflicts.length, 1);
});

test("mergeMarkers rejects non-array inputs instead of silently treating them as empty", () => {
    const community = [{ x: 1, y: 1, z: 0, icon: "flag", description: "Only entry" }];
    assert.throws(() => mergeMarkers(undefined, community), /mergeMarkers expects personal to be an array/);
    assert.throws(() => mergeMarkers(null, community), /mergeMarkers expects personal to be an array/);
    assert.throws(() => mergeMarkers([], "not an array"), /mergeMarkers expects community to be an array/);
    assert.doesNotThrow(() => mergeMarkers([], community));
});

/* ==========================================================================
   End-to-end: JSON in, binary out, and back
   ========================================================================== */

test("a community JSON export can be merged with personal markers and written to a valid binary file", () => {
    const communityJson = JSON.stringify([
        { x: 1000, y: 2000, z: 7, icon: "sword", description: "Community Hi" },
        { x: 0, y: 4194303, z: 0, icon: "checkmark", description: "" }
    ]);
    const community = parseMarkerJson(communityJson);
    const personal = [{ x: 1000, y: 2000, z: 7, icon: "star", description: "My override" }];

    const { markers } = mergeMarkers(personal, community);
    const bytes = writeMarkerBinary(markers);
    const roundTripped = parseMarkerBinary(bytes);

    assert.deepEqual(roundTripped, sortForComparison(markers));
    assert.ok(roundTripped.some((m) => m.description === "My override"));
    assert.ok(!roundTripped.some((m) => m.description === "Community Hi"));
});

test("unsupported null icons and unpaired Unicode surrogates are rejected before merge or conversion", () => {
 assert.throws(()=>parseMarkerJson(JSON.stringify([{...HI_MARKER,icon:null}])),/unsupported icon/);
 assert.throws(()=>writeMarkerBinary([{...HI_MARKER,description:"\ud800"}]),/invalid Unicode/);
 assert.throws(()=>mergeMarkers([null],[]),/not an object/);
});

test("published TibiaMaps hexdump gives real-world marker coordinates and lossless bytes", () => {
 // https://tibiamaps.io/guides/minimap-file-format#map-marker-data
 const bytes = Uint8Array.from(Buffer.from("0a2a0a0a088efc0110abfb01180710021a184675727920476174652028776f726c64206368616e6765292000", "hex"));
 assert.deepEqual(parseMarkerBinary(bytes),[{x:32270,y:32171,z:7,icon:"!",description:"Fury Gate (world change)"}]);
 assert.deepEqual(writeMarkerBinary(parseMarkerBinary(bytes)),bytes);
});
