/**
 * Local implementation of the Tibia client's `minimapmarkers.bin` format,
 * plus a JSON form and a personal/community merge. Byte layout, the
 * coordinate encoding formula, and the icon table below were verified by
 * reading the source of the `nesleykent/tibia-maps-merge` reference
 * implementation at commit `6994248e1ea9224487f713eed8b53233d5db2df1`
 * (`docs/lib/constants.js`, `docs/lib/markers.js`, `tibiamaps/markers.py`,
 * `tibiamaps/constants.py`), which itself cites the primary format guide at
 * https://tibiamaps.io/guides/minimap-file-format . The primary TibiaMaps guide and its published Fury Gate hexdump were also
 * checked independently; the test suite roundtrips those bytes. No live client
 * installation was exercised. See docs/minimap-markers-format.md
 * for the full provenance and the specific claims that rest only on that
 * source-reading, not on independent byte-level confirmation.
 */

/**
 * Byte <-> icon name. The strings are the exact identifiers used by the
 * `nesleykent/tibia-maps-merge` reference's `constants.js`/`constants.py`
 * (e.g. `"?"`, `"!"`, `"$"`, `"red up"`), not this module's own invention:
 * they are short, functional labels for particular byte values, and using
 * the same ones is required for a marker JSON document written by this
 * module to be read by, or interchanged with, community tooling that
 * already uses that vocabulary.
 */
export const ICONS_BY_ID = new Map([
    [0x00, "checkmark"],
    [0x01, "?"],
    [0x02, "!"],
    [0x03, "star"],
    [0x04, "crossmark"],
    [0x05, "cross"],
    [0x06, "mouth"],
    [0x07, "spear"],
    [0x08, "sword"],
    [0x09, "flag"],
    [0x0A, "lock"],
    [0x0B, "bag"],
    [0x0C, "skull"],
    [0x0D, "$"],
    [0x0E, "red up"],
    [0x0F, "red down"],
    [0x10, "red right"],
    [0x11, "red left"],
    [0x12, "up"],
    [0x13, "down"]
]);

export const ICONS_BY_NAME = new Map([...ICONS_BY_ID].map(([id, name]) => [name, id]));

/**
 * A coordinate is stored as three bytes; the encode/decode formulas below are
 * exact inverses of each other for every integer in this range (proven by
 * algebraic derivation, not sampled). This three-byte layout is this client's
 * own convention for representing an integer, not the only way one could be
 * encoded; `MAX_COORDINATE` is set to match that convention as implemented by
 * the reference source above (`0xFF + 0x80*0xFF + 0x4000*0xFF - 0x4080`), and
 * a value can't be represented in it once any of the three bytes would have
 * to fall outside 0-255.
 */
export const MIN_COORDINATE = 0;
export const MAX_COORDINATE = 0x3FFFFF; // 0xFF + 0x80*0xFF + 0x4000*0xFF - 0x4080

/** The client only ever renders 16 floors; a byte can technically hold more (see docs). */
export const MIN_FLOOR = 0;
export const MAX_FLOOR = 15;

/** Length-prefixed by a single byte, but the client itself never writes more than this. */
export const MAX_DESCRIPTION_BYTES = 100;

const RECORD_TAG = 0x0A;
const COORDINATE_BLOCK_TAG = 0x0A;
const COORDINATE_BLOCK_LENGTH = 0x0A;
const X_FIELD_TAG = 0x08;
const Y_FIELD_TAG = 0x10;
const Z_FIELD_TAG = 0x18;
const ICON_FIELD_TAG = 0x10;
const DESCRIPTION_FIELD_TAG = 0x1A;
const TERMINATOR = Uint8Array.of(0x20, 0x00);

function hex(byte) {
    return `0x${byte.toString(16).padStart(2, "0")}`;
}

function decodeCoordinate(b0, b1, b2) {
    return b0 + 0x80 * b1 + 0x4000 * b2 - 0x4080;
}

/** The unique inverse of decodeCoordinate for every value in [MIN_COORDINATE, MAX_COORDINATE]. */
function encodeCoordinate(value, label) {
    if (!Number.isInteger(value) || value < MIN_COORDINATE || value > MAX_COORDINATE) {
        throw new Error(`${label} must be an integer between ${MIN_COORDINATE} and ${MAX_COORDINATE}, got ${value}`);
    }
    const b2 = value >> 14;
    const b0 = 0x80 + (value % 0x80);
    const b1 = (value - 0x4000 * b2 - b0 + 0x4080) >> 7;
    return [b0, b1, b2];
}

function toUint8Array(input) {
    if (input instanceof Uint8Array) return input;
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    throw new Error("parseMarkerBinary expects an ArrayBuffer or a Uint8Array");
}

/** Stable ordering preserves same-coordinate precedence. */
function compareMarkers(a, b) {
    return (a.z - b.z) || (a.x - b.x) || (a.y - b.y);
}

function sortMarkers(markers) {
    return [...markers].sort(compareMarkers);
}

/**
 * Parses a `minimapmarkers.bin` payload into `{x, y, z, icon, description}` records.
 * Every read is bounds-checked against the buffer length, so a truncated or
 * otherwise corrupt file throws a descriptive error instead of silently
 * yielding `undefined`/`NaN` fields. An icon byte outside the known table, a
 * floor or decoded coordinate outside its valid range, and a description
 * that is not valid UTF-8 are all rejected here, at parse time, rather than
 * being silently converted to `null`/replacement characters and only
 * surfacing as a problem later (e.g. when writing or rendering the marker).
 */
export function parseMarkerBinary(input, { source } = {}) {
    const label = source || "<buffer>";
    const data = toUint8Array(input);
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const length = data.length;
    const markers = [];
    let offset = 0;

    const require = (count, what) => {
        if (offset + count > length) {
            throw new Error(`${label}: truncated ${what} at byte ${offset} (${length - offset} byte(s) left, need ${count})`);
        }
    };
    const readByte = (what) => {
        require(1, what);
        return data[offset++];
    };
    const expectByte = (expected, what) => {
        const actual = readByte(what);
        if (actual !== expected) {
            throw new Error(`${label}: expected ${what} ${hex(expected)} at byte ${offset - 1}, found ${hex(actual)}`);
        }
    };

    while (offset < length) {
        expectByte(RECORD_TAG, "marker record tag");
        readByte("marker record length"); // not needed for parsing -- see docs on why we resync on RECORD_TAG instead
        expectByte(COORDINATE_BLOCK_TAG, "coordinate block tag");
        const coordinateBlockLength = readByte("coordinate block length");
        if (coordinateBlockLength !== COORDINATE_BLOCK_LENGTH) {
            throw new Error(`${label}: unsupported coordinate block length ${hex(coordinateBlockLength)} at byte ${offset - 1}`);
        }

        expectByte(X_FIELD_TAG, "x field tag");
        require(3, "x coordinate bytes");
        const x = decodeCoordinate(data[offset], data[offset + 1], data[offset + 2]);
        if (x < MIN_COORDINATE || x > MAX_COORDINATE) {
            throw new Error(`${label}: x coordinate ${x} decoded out of range [${MIN_COORDINATE}, ${MAX_COORDINATE}] at byte ${offset}`);
        }
        offset += 3;

        expectByte(Y_FIELD_TAG, "y field tag");
        require(3, "y coordinate bytes");
        const y = decodeCoordinate(data[offset], data[offset + 1], data[offset + 2]);
        if (y < MIN_COORDINATE || y > MAX_COORDINATE) {
            throw new Error(`${label}: y coordinate ${y} decoded out of range [${MIN_COORDINATE}, ${MAX_COORDINATE}] at byte ${offset}`);
        }
        offset += 3;

        expectByte(Z_FIELD_TAG, "z field tag");
        const z = readByte("z floor byte");
        if (z < MIN_FLOOR || z > MAX_FLOOR) {
            throw new Error(`${label}: floor z=${z} out of range [${MIN_FLOOR}, ${MAX_FLOOR}] at byte ${offset - 1}`);
        }

        expectByte(ICON_FIELD_TAG, "icon field tag");
        const iconByte = readByte("icon byte");
        const icon = ICONS_BY_ID.get(iconByte);
        if (icon === undefined) {
            throw new Error(`${label}: unsupported icon byte ${hex(iconByte)} at byte ${offset - 1}`);
        }

        expectByte(DESCRIPTION_FIELD_TAG, "description field tag");
        const descriptionLength = readByte("description length");
        require(descriptionLength, "description bytes");
        let description;
        try {
            description = decoder.decode(data.subarray(offset, offset + descriptionLength));
        } catch (err) {
            throw new Error(`${label}: invalid UTF-8 description at byte ${offset} (${err.message})`);
        }
        offset += descriptionLength;

        // The reference source resyncs on the next record tag instead of trusting
        // a fixed terminator, citing real client files that end a record with
        // malformed trailing bytes instead of the usual 0x20 0x00 terminator (see
        // docs/lib/markers.js and https://github.com/tibiamaps/tibia-maps-script/issues/21
        // in the reference at the revision cited above). That quirk was not
        // independently reproduced against a live client file here; this resync
        // is kept because the reference documents it as necessary.
        while (offset < length && data[offset] !== RECORD_TAG) offset += 1;

        markers.push(validateMarkerRow({ x, y, z, icon, description }, markers.length));
    }

    return markers;
}

/** Serializes marker records back into the client's binary format, sorted the same way parseMarkerBinary returns them. */
export function writeMarkerBinary(markers) {
    if (!Array.isArray(markers)) {
        throw new Error("writeMarkerBinary expects an array of markers");
    }

    const encoder = new TextEncoder();
    const chunks = [];
    let total = 0;

    for (const marker of sortMarkers(markers.map(validateMarkerRow))) {
        const description = encoder.encode(marker?.description ?? "");
        if (description.length > MAX_DESCRIPTION_BYTES) {
            throw new Error(`marker description is ${description.length} bytes, exceeding the ${MAX_DESCRIPTION_BYTES}-byte limit: ${JSON.stringify(marker)}`);
        }
        const iconByte = ICONS_BY_NAME.get(marker?.icon);
        if (iconByte === undefined) {
            throw new Error(`marker has an unwritable icon ${JSON.stringify(marker?.icon)}: ${JSON.stringify(marker)}`);
        }
        if (!Number.isInteger(marker?.z) || marker.z < MIN_FLOOR || marker.z > MAX_FLOOR) {
            throw new Error(`marker floor z must be an integer between ${MIN_FLOOR} and ${MAX_FLOOR}, got ${marker?.z}: ${JSON.stringify(marker)}`);
        }
        const [x0, x1, x2] = encodeCoordinate(marker?.x, "marker x");
        const [y0, y1, y2] = encodeCoordinate(marker?.y, "marker y");

        const recordLength = 18 + description.length; // bytes following the [tag, length] pair itself
        const header = Uint8Array.of(
            RECORD_TAG, recordLength,
            COORDINATE_BLOCK_TAG, COORDINATE_BLOCK_LENGTH,
            X_FIELD_TAG, x0, x1, x2,
            Y_FIELD_TAG, y0, y1, y2,
            Z_FIELD_TAG, marker.z,
            ICON_FIELD_TAG, iconByte,
            DESCRIPTION_FIELD_TAG, description.length
        );

        chunks.push(header, description, TERMINATOR);
        total += header.length + description.length + TERMINATOR.length;
    }

    const result = new Uint8Array(total);
    let position = 0;
    for (const chunk of chunks) {
        result.set(chunk, position);
        position += chunk.length;
    }
    return result;
}

function requireInteger(value, min, max, field, index) {
    if (!Number.isInteger(value) || value < min || value > max) {
        throw new Error(`marker JSON entry ${index}: ${field} must be an integer between ${min} and ${max}, got ${JSON.stringify(value)}`);
    }
}

/** Validates one row against the community `markers.json` schema: {description, icon, x, y, z}. */
function validateMarkerRow(row, index) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
        throw new Error(`marker JSON entry ${index} is not an object`);
    }
    requireInteger(row.x, MIN_COORDINATE, MAX_COORDINATE, "x", index);
    requireInteger(row.y, MIN_COORDINATE, MAX_COORDINATE, "y", index);
    requireInteger(row.z, MIN_FLOOR, MAX_FLOOR, "z", index);
    if (row.icon !== null && typeof row.icon !== "string") {
        throw new Error(`marker JSON entry ${index}: icon must be a string or null, got ${JSON.stringify(row.icon)}`);
    }
    if (!ICONS_BY_NAME.has(row.icon)) {
        throw new Error(`marker JSON entry ${index}: unsupported icon ${JSON.stringify(row.icon)}`);
    }
    if (typeof row.description !== "string") {
        throw new Error(`marker JSON entry ${index}: description must be a string, got ${JSON.stringify(row.description)}`);
    }
    const encoded = new TextEncoder().encode(row.description);
    if (new TextDecoder().decode(encoded) !== row.description) throw new Error(`marker JSON entry ${index}: invalid Unicode description`);
    const descriptionBytes = encoded.length;
    if (descriptionBytes > MAX_DESCRIPTION_BYTES) {
        throw new Error(`marker JSON entry ${index}: description is ${descriptionBytes} bytes, exceeding the ${MAX_DESCRIPTION_BYTES}-byte limit`);
    }
    return { x: row.x, y: row.y, z: row.z, icon: row.icon, description: row.description };
}

/** Parses a community-schema marker JSON document (a plain array of marker rows) into validated marker records. */
export function parseMarkerJson(text) {
    if (typeof text !== "string") {
        throw new Error("parseMarkerJson expects a JSON string");
    }
    let data;
    try {
        data = JSON.parse(text);
    } catch (err) {
        throw new Error(`invalid marker JSON: ${err.message}`);
    }
    if (!Array.isArray(data)) {
        throw new Error("marker JSON must be an array of marker objects");
    }
    return data.map(validateMarkerRow);
}

function coordinateKey(marker) {
    return `${marker.x},${marker.y},${marker.z}`;
}

/** Last occurrence in the input array wins -- a deterministic, order-based policy for same-coordinate duplicates within one list. */
function indexByCoordinate(list) {
    const byKey = new Map();
    let duplicates = 0;
    for (const marker of list) {
        const key = coordinateKey(marker);
        if (byKey.has(key)) duplicates += 1;
        byKey.set(key, marker);
    }
    return { byKey, duplicates };
}

function markersEqual(a, b) {
    return a.icon === b.icon && a.description === b.description;
}

/**
 * Merges a personal marker list with a community marker list, keyed by
 * (x, y, z). Personal always wins at a shared coordinate, regardless of
 * argument order or which list is larger -- this is a merge policy, not a
 * binary-format fact. Both arguments must be arrays; a missing side should
 * be passed as `[]` explicitly rather than `undefined`/`null`, so a caller
 * mistake (e.g. passing the wrong variable) fails loudly instead of quietly
 * merging against an empty list.
 */
export function mergeMarkers(personal, community) {
    if (!Array.isArray(personal)) {
        throw new Error(`mergeMarkers expects personal to be an array, got ${JSON.stringify(personal)}`);
    }
    if (!Array.isArray(community)) {
        throw new Error(`mergeMarkers expects community to be an array, got ${JSON.stringify(community)}`);
    }
    const personalList = personal.map(validateMarkerRow);
    const communityList = community.map(validateMarkerRow);

    const { byKey: communityByKey, duplicates: communityDuplicates } = indexByCoordinate(communityList);
    const { byKey: personalByKey, duplicates: personalDuplicates } = indexByCoordinate(personalList);

    const merged = new Map(communityByKey);
    const conflicts = [];

    for (const [key, personalMarker] of personalByKey) {
        const communityMarker = communityByKey.get(key);
        if (communityMarker) {
            conflicts.push({
                x: personalMarker.x, y: personalMarker.y, z: personalMarker.z,
                personal: personalMarker, community: communityMarker,
                identical: markersEqual(personalMarker, communityMarker)
            });
        }
        merged.set(key, personalMarker);
    }

    const markers = sortMarkers([...merged.values()]);

    return {
        markers,
        summary: {
            personalCount: personalList.length,
            communityCount: communityList.length,
            personalDuplicates,
            communityDuplicates,
            mergedCount: markers.length,
            conflictCount: conflicts.length,
            identicalConflictCount: conflicts.filter((conflict) => conflict.identical).length
        },
        conflicts
    };
}
