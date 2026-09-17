/**
 * Morning Tibia: reads World Board and Guide NPC text pasted from the game and reports what
 * it actually proves about World Changes and Mini World Changes — never more.
 *
 * Parsing approach (normalized substring matching, board-completeness-gated absence, latest
 * Guide reply wins) is adapted from the MIT-licensed github.com/nesleykent/morning-tibia.
 * See third-party/morning-tibia-LICENSE.txt for that project's original notice.
 *
 * The World Change / Mini World Change catalog (ids, names, World Board message text, Guide
 * reply text) lives in src/data/world-changes.json and is sourced from TibiaWiki under
 * CC BY-SA — a data license, kept distinct from this file's own code license. See
 * docs/morning-tibia-sources.md for full provenance.
 *
 * Outcomes preserve known, unknown, conflict and tentative source evidence:
 * - "known"    — the text proved a specific state (Guide reply) or activity (Board line), or
 *                proved an announced Mini World Change is NOT running (a complete Board
 *                reading that never mentioned it).
 * - "tentative" — a matched reply uses wording flagged unverified upstream.
 * - "unknown"  — nothing in the text settles this entry. Never defaulted to a "quiet" or
 *                "inactive" state just because it's the common one.
 * - "conflict" — the text itself contains mutually exclusive evidence for the same entry
 *                (two different Board variant lines for one Mini World Change in one paste).
 *
 * A partial Board paste (no preamble, no explicit fullBoard flag) can only ever prove the
 * entries it actually names are active. It is never treated as proof anything else is not
 * running — only a source declared complete can settle a negative.
 */

import catalog from "../../data/world-changes.json" with { type: "json" };

const GUIDE_SPEAKER_LINE = /^Guide\s+[A-Z][\w'-]*\s*:\s*(.+)$/;

/** Guide small talk that is unmistakably a Guide speaking but is never a World Change reply. */
const NON_STATE_REPLY_PATTERNS = [
    /welcome to \w+/i,
    /information (?:or|and) a map/i,
    /^\d+\s+actions?\b/i
];

/** Collapses whitespace, curly quotes and case so pasted text with line-wraps still matches. */
function normalizeForMatch(value) {
    return String(value ?? "")
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

/** Catalog text with its trailing sentence punctuation removed, so a reply that keeps going
 * past the quoted text (a live counter, a trailing clause the wiki omits) still matches. */
function matchKey(value) {
    return normalizeForMatch(value).replace(/[.!,;:]+$/, "");
}

function dedupeEvidence(evidence) {
    const seen = new Set();
    const result = [];
    for (const item of evidence) {
        const key = `${item.source}\u0000${item.text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(item);
    }
    return result;
}

function readBoardSignals(normalizedInput) {
    const matchesByChangeId = new Map();
    let recognisedCount = 0;

    for (const change of catalog.miniWorldChanges) {
        for (const message of change.boardMessages ?? []) {
            const normalizedMessage = normalizeForMatch(message.text);
            if (!normalizedMessage || !normalizedInput.includes(normalizedMessage)) continue;

            recognisedCount += 1;
            const list = matchesByChangeId.get(change.id) ?? [];
            list.push({ variantId: message.variantId ?? null, text: message.text });
            matchesByChangeId.set(change.id, list);
        }
    }

    const normalizedPreamble = normalizeForMatch(catalog.boardPreamble);
    const hasPreamble = normalizedPreamble.length > 0 && normalizedInput.includes(normalizedPreamble);

    return { matchesByChangeId, hasPreamble, recognisedCount };
}

function readGuideSignals(rawText) {
    const bestByChangeId = new Map();
    const unrecognisedReplies = [];
    const candidates = [];
    for (const line of rawText.split(/\r?\n/)) {
        const clean = line.trim().replace(/^\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s+/, "");
        const spoken = GUIDE_SPEAKER_LINE.exec(clean)?.[1]?.trim();
        // Other NPC/player dialogue is never promoted into Guide evidence.
        if (!spoken && /^[^:]+:/.test(clean)) continue;
        const text = spoken ?? clean;
        if (!text || NON_STATE_REPLY_PATTERNS.some(pattern => pattern.test(text))) continue;
        candidates.push({text, spoken: Boolean(spoken)});
    }
    for (const {text, spoken} of candidates) {
        const normalized = normalizeForMatch(text);
        let recognized = false;
        for (const change of catalog.worldChanges) {
            for (const message of change.guideMessages ?? []) {
                for (const wording of [message.text, ...(message.alsoMatches ?? [])]) {
                    const key = matchKey(wording);
                    if (!key || !normalized.startsWith(key)) continue;
                    const remainder = normalized.slice(key.length);
                    if (remainder && !/^[\s.,;:!?]/.test(remainder)) continue;
                    recognized = true;
                    bestByChangeId.set(change.id, {stateId: message.stateId, text, tentative:message.unverifiedWording === true});
                }
            }
        }
        if (!recognized && spoken) unrecognisedReplies.push(text);
    }
    return {bestByChangeId, unrecognisedReplies};
}

function buildMiniWorldChangeEntries(board, boardComplete, hasPreamble, issues) {
    const entries = [];

    for (const change of catalog.miniWorldChanges) {
        const matches = board.matchesByChangeId.get(change.id) ?? [];

        if (matches.length === 0) {
            if (change.detection === "announced" && boardComplete) {
                entries.push({
                    id: change.id,
                    name: change.name,
                    kind: "mini-world-change",
                    status: "known",
                    variant: null,
                    evidence: [
                        hasPreamble
                            ? { source: "board-preamble", text: catalog.boardPreamble }
                            : { source: "fullBoard-flag", text: "Caller asserted a complete World Board reading." }
                    ]
                });
            } else {
                entries.push({
                    id: change.id,
                    name: change.name,
                    kind: "mini-world-change",
                    status: "unknown",
                    variant: null,
                    evidence: []
                });
            }
            continue;
        }

        const distinctVariants = new Set(matches.map((match) => match.variantId ?? ""));
        const evidence = dedupeEvidence(matches.map((match) => ({ source: "board", text: match.text })));

        if (distinctVariants.size > 1) {
            entries.push({
                id: change.id,
                name: change.name,
                kind: "mini-world-change",
                status: "conflict",
                variant: null,
                evidence
            });
            issues.push({ code: "conflict", kind: "mini-world-change", id: change.id, name: change.name });
        } else {
            entries.push({
                id: change.id,
                name: change.name,
                kind: "mini-world-change",
                status: "known",
                variant: matches[0].variantId ?? null,
                evidence
            });
        }
    }

    return entries;
}

function buildWorldChangeEntries(guide) {
    return catalog.worldChanges.map((change) => {
        const best = guide.bestByChangeId.get(change.id);
        if (!best) {
            return { id: change.id, name: change.name, kind: "world-change", status: "unknown", variant: null, evidence: [] };
        }
        return {
            id: change.id,
            name: change.name,
            kind: "world-change",
            status: best.tentative ? "tentative" : "known",
            variant: best.stateId,
            evidence: [{ source: "guide", text: best.text }]
        };
    });
}

/**
 * Parses pasted World Board and/or Guide NPC text into per-entry World Change / Mini World
 * Change knowledge. Pure: no I/O, no shared state, no reliance on wall-clock time.
 *
 * @param {string} text - Raw pasted game text (server log lines, chat log lines, or both).
 * @param {{world?: string, fullBoard?: boolean}} [options]
 *   `world` is echoed back on the result untouched; it labels which Tibia world the paste
 *   concerns and has no effect on parsing. `fullBoard: true` is the caller's explicit
 *   assertion that the paste is a complete World Board reading, used when the paste is
 *   missing the board's own preamble line (e.g. it was trimmed before pasting) — see the
 *   module doc comment for why that is the only other way to license an absence.
 * @returns {{world: string|null, entries: Array<{id: string, name: string, kind: "world-change"|"mini-world-change", status: "known"|"unknown"|"conflict", variant: string|null, evidence: Array<{source: string, text: string}>}>, issues: Array<object>}}
 */
export function parseMorningTibia(text, options = {}) {
    const world = options.world ?? null;
    const fullBoard = options.fullBoard === true;
    const rawText = typeof text === "string" ? text : "";
    const normalizedInput = normalizeForMatch(rawText);

    const issues = [];

    const board = readBoardSignals(normalizedInput);
    const guide = readGuideSignals(rawText);

    const boardComplete = board.hasPreamble || (fullBoard && board.recognisedCount > 0);
    if (fullBoard && !board.hasPreamble && board.recognisedCount === 0) {
        issues.push({
            code: "fullboard-empty",
            message: "fullBoard was set, but no World Board preamble or messages were recognised in the text."
        });
    }

    for (const [id, best] of guide.bestByChangeId) {
        if (best.tentative) issues.push({code:"unverified-wording", id, message:"This wording is marked unverified by the reference catalog. Confirm the state in game."});
    }
    for (const reply of guide.unrecognisedReplies) {
        issues.push({ code: "guide-reply-unrecognised", text: reply });
    }

    const entries = [
        ...buildMiniWorldChangeEntries(board, boardComplete, board.hasPreamble, issues),
        ...buildWorldChangeEntries(guide)
    ];

    return { world, entries, issues };
}
