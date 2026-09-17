/**
 * Import and export of tracker progress, driven entirely by the tracker's
 * `transfer` block.
 *
 * Only user-owned columns are ever read. Points, thresholds and categories always
 * come from the game data, never from the file — an exported sheet goes stale as
 * soon as CipSoft rebalances something, and the reference Bestiary CSV already
 * disagreed with the current dataset on one row.
 */

/** Minimal RFC 4180 reader: quoted fields, escaped quotes, CR/LF endings. */
export function parseCsvRows(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    let closedQuote = false;
    let index = 0;

    const endField = () => { row.push(field); field = ""; closedQuote = false; };
    const endRow = () => { endField(); rows.push(row); row = []; };

    while (index < text.length) {
        const char = text[index];

        if (inQuotes) {
            if (char === '"') {
                if (text[index + 1] === '"') {
                    field += '"';
                    index += 2;
                    continue;
                }
                inQuotes = false;
                closedQuote = true;
                index += 1;
                continue;
            }

            field += char;
            index += 1;
            continue;
        }

        if (closedQuote && ![",", "\r", "\n"].includes(char)) {
            throw new Error("Unexpected text after a quoted CSV field.");
        }

        if (char === '"') {
            if (field.length) throw new Error("A CSV quote must begin a field.");
            inQuotes = true;
            index += 1;
            continue;
        }

        if (char === ",") {
            endField();
            index += 1;
            continue;
        }

        if (char === "\r") {
            endRow();
            if (text[index + 1] === "\n") index += 1;
            index += 1;
            continue;
        }

        if (char === "\n") {
            endRow();
            index += 1;
            continue;
        }

        field += char;
        index += 1;
    }

    if (inQuotes) throw new Error("That CSV has an unclosed quoted field.");

    if (field.length || row.length || closedQuote) {
        endRow();
    }

    return rows.filter((candidate) => candidate.some((cell) => cell.trim().length));
}

/** "1,846" and " 1846 " both mean 1846. */
export function parseCount(value) {
    const text = String(value ?? "").trim();
    if (!text) return 0;
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text)) {
        throw new Error(`Invalid progress count: ${text}. Use a nonnegative whole number.`);
    }
    const count = Number(text.replaceAll(",", ""));
    if (!Number.isSafeInteger(count)) throw new Error("That progress count is too large.");
    return count;
}

/**
 * Keys are matched case- and whitespace-insensitively. Upstream data is not tidy:
 * 47 quest names and one achievement name carry a trailing space, and trimming
 * only the incoming value silently dropped every one of them on import.
 */
function buildKeyIndex(items, tracker) {
    return new Map(items.map((item) => {
        const key = tracker.itemKey(item);

        return [key.trim().toLowerCase(), key];
    }));
}

function collect(tracker, pairs) {
    const record = {};
    let matched = 0;

    const seen = new Set();
    pairs.forEach(([key, raw]) => {
        if (seen.has(key)) throw new Error(`Duplicate progress entry: ${key}.`);
        seen.add(key);
        matched += 1;

        const entry = Object.entries(tracker.entryDefaults).reduce((next, [field, fallback]) => {
            const value = raw[field];
            next[field] = typeof fallback === "number" ? parseCount(value) : Boolean(value);
            return next;
        }, {});

        if (Object.entries(tracker.entryDefaults).some(([field, fallback]) => entry[field] !== fallback)) {
            record[key] = entry;
        }
    });

    return { record, matched };
}

export function importTrackerCsv(text, items, tracker) {
    const rows = parseCsvRows(text);

    if (!rows.length) {
        throw new Error("That file has no rows.");
    }

    const header = rows[0].map((cell) => cell.trim());
    if (new Set(header.map((cell) => cell.toLowerCase())).size !== header.length) {
        throw new Error("That CSV has duplicate column names.");
    }
    const indexOf = (name) => header.findIndex((cell) => cell.toLowerCase() === name.toLowerCase());
    const missing = (tracker.transfer.requiredColumns ?? []).filter((name) => indexOf(name) === -1);

    if (missing.length) {
        throw new Error(`That CSV is missing the ${missing.join(" and ")} column${missing.length > 1 ? "s" : ""}.`);
    }

    // The identifying column is usually "Name", but a tracker may call it
    // something truer to its own data — the Cyclopedia Map calls it "Subarea".
    const nameIndex = indexOf(tracker.transfer.nameColumn ?? "Name");
    const firstIndex = 0;
    const byKey = buildKeyIndex(items, tracker);
    const unmatched = [];
    const pairs = [];

    rows.slice(1).forEach((row) => {
        const rawName = (row[nameIndex] ?? "").trim();

        // The reference export ends with a totals row. It is a summary, not an
        // item, so it must not be reported as an unmatched name.
        if (!rawName || /^total$/i.test((row[firstIndex] ?? "").trim())) {
            return;
        }

        const key = byKey.get(rawName.toLowerCase());

        if (!key) {
            unmatched.push(rawName);
            return;
        }

        const cell = (columnName) => row[indexOf(columnName)];

        const booleans = ["Bookmark", "Earned", "Completed", "Discovered", "Echo Warden", "Animus Mastery", "Reviewed"];
        booleans.filter((column) => indexOf(column) >= 0 && (column !== "Earned" || tracker.id !== "bestiary")).forEach((column) => {
            const value = String(cell(column) ?? "").trim();
            if (value && !/^(yes|no|true|false|1|0|y|n)$/i.test(value)) {
                throw new Error(`Invalid ${column} value for ${key}. Use Yes or No.`);
            }
        });
        pairs.push([key, {
            ...tracker.transfer.readRow(cell),
            reviewed: /^(yes|true|1|y)$/i.test(String(cell("Reviewed") ?? "").trim())
        }]);
    });

    const { record, matched } = collect(tracker, pairs);

    return { record, matched, unmatched };
}

/** A vendor JSON export whose own per-item user block the tracker knows how to read. */
export function importTrackerJson(text, items, tracker) {
    if (!tracker.transfer.readJsonRow) {
        throw new Error("This tracker only imports CSV.");
    }

    let payload;

    try {
        payload = JSON.parse(text);
    } catch (error) {
        throw new Error("That file is not valid JSON.");
    }

    const rows = Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload) ? payload : null);

    if (!rows) {
        throw new Error("That JSON does not look like a progress export.");
    }

    const byKey = buildKeyIndex(items, tracker);
    const unmatched = [];
    const pairs = [];

    rows.forEach((item) => {
        const rawName = String(item?.name ?? "").trim();

        if (!rawName) {
            return;
        }

        const key = byKey.get(rawName.toLowerCase());

        if (!key) {
            unmatched.push(rawName);
            return;
        }

        pairs.push([key, tracker.transfer.readJsonRow(item)]);
    });

    const { record, matched } = collect(tracker, pairs);

    return { record, matched, unmatched };
}

function csvCell(value) {
    const text = String(value ?? "");

    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function exportTrackerCsv(rows, items, tracker) {
    const { csvColumns, writeRow, writeTotals } = tracker.transfer;
    const itemByKey = new Map(items.map((item) => [tracker.itemKey(item), item]));
    const lines = [[...csvColumns, "Reviewed"].join(",")];

    rows.forEach((row) => {
        lines.push([...writeRow(row, itemByKey.get(row.key)), row.reviewed ? "Yes" : "No"].map(csvCell).join(","));
    });

    if (writeTotals) {
        lines.push([...writeTotals(rows), ""].map(csvCell).join(","));
    }

    return `${lines.join("\n")}\n`;
}

export function buildTrackerExportFileName(tracker, exportedAt) {
    return `${tracker.transfer.fileStem}-${String(exportedAt).slice(0, 10)}.csv`;
}
