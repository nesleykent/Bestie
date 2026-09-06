import { PROFICIENCY_BY_DIFFICULTY, calculateWeaponProjection } from "../features/weapon-proficiency.js";
import { formatNumber, formatTime, formatTimeDetailed } from "../utils/formatters.js";
import { buildAnswer, buildEmptyState, buildPill, buildStatLine, escapeAttribute } from "./render-blocks.js";
import { escapeText } from "./render-tracker.js";

const number = (value) => value === null ? "—" : formatNumber(value);
const difficultyLabel = (value) => value ? value[0].toUpperCase() + value.slice(1) : "Unclassified";
const COLUMNS = [
    ["name", "Creature"], ["difficulty", "Bestiary Difficulty"], ["kills", "Kills"],
    ["perKill", "Proficiency XP / Kill"], ["total", "Total Proficiency XP"], ["contribution", "Contribution %"]
];

export function buildWeaponProjection(plan, session, creatureName = "") {
    const currentXP = plan.currentXP.trim() === "" ? NaN : Number(plan.currentXP);
    const targetXP = plan.targetXP.trim() === "" ? NaN : Number(plan.targetXP);
    const creature = session.rows.find((row) => row.name === creatureName);
    const projection = calculateWeaponProjection({ currentXP, targetXP }, session, creature?.perKill);
    if (!projection) return '<p class="helper-text">Enter non-negative whole XP values and a target within the safe integer range.</p>';
    const time = projection.hoursRemaining === null ? "—" : formatTimeDetailed(projection.hoursRemaining * 60);
    return `${buildStatLine([
        `<strong>${number(projection.remainingXP)}</strong> XP remaining`,
        `<strong>${time}</strong> estimated time`,
        `<strong>${projection.sessionsRemaining === null ? "—" : projection.sessionsRemaining.toFixed(1)}</strong> equivalent sessions`,
        creature ? `<strong>${number(projection.killsRemaining)}</strong> kills if hunting only ${escapeText(creature.name)}` : ""
    ])}<progress class="weapon-progress" max="1" value="${projection.progress}" aria-label="Weapon XP toward target"></progress>
    ${session.isPartial ? '<p class="helper-text">Resolve unclassified creatures or invalid data before using session-based projections.</p>' : session.perHour === null || session.perHour === 0 ? '<p class="helper-text">A positive measured rate is needed to estimate remaining time.</p>' : ""}`;
}

function buildPlanner(session, plans, activeId, projectionCreature) {
    const plan = plans.find((entry) => entry.id === activeId) ?? plans[0];
    return `<section class="results-section" aria-labelledby="weaponPlanTitle">
        <h3 class="subsection-title" id="weaponPlanTitle">Weapon progress</h3>
        <div class="library-controls proficiency-controls">
            <div><label class="input-label" for="weaponPlanSelect">Saved weapon</label><select id="weaponPlanSelect">${plans.map((entry, index) => `<option value="${escapeAttribute(entry.id)}" ${entry.id === plan.id ? "selected" : ""}>${escapeText(entry.name || `Weapon ${index + 1}`)}</option>`).join("")}</select></div>
            <button class="btn btn-secondary" type="button" id="addWeaponPlan">Add weapon</button>
            <div><label class="input-label" for="weaponName">Weapon name / identifier</label><input id="weaponName" data-weapon-field="name" type="text" maxlength="120" value="${escapeAttribute(plan.name)}" placeholder="e.g. My soulshredder"></div>
            <div><label class="input-label" for="weaponCurrentXP">Current Proficiency XP</label><input id="weaponCurrentXP" data-weapon-field="currentXP" type="number" min="0" step="1" max="${Number.MAX_SAFE_INTEGER}" value="${escapeAttribute(plan.currentXP)}"></div>
            <div><label class="input-label" for="weaponTargetXP">Target Proficiency XP</label><input id="weaponTargetXP" data-weapon-field="targetXP" type="number" min="0" step="1" max="${Number.MAX_SAFE_INTEGER}" value="${escapeAttribute(plan.targetXP)}" placeholder="Your manual target"></div>
        </div>
        <div id="weaponProjection" role="status">${buildWeaponProjection(plan, session, projectionCreature)}</div>
        <p class="helper-text">Manual XP target: official weapon milestones are not bundled. Estimates assume this weapon receives credit for these kills at the measured rate. Update current XP from the game; sessions never add it automatically.</p>
    </section>`;
}

export function renderProficiency(container, session, { processed, sort, plans, activeId, projectionCreature }) {
    const factor = sort.direction === "asc" ? 1 : -1;
    const difficulties = Object.keys(PROFICIENCY_BY_DIFFICULTY);
    const rows = [...session.rows].sort((a, b) => {
        const left = sort.key === "difficulty" ? difficulties.indexOf(a.difficulty) : a[sort.key];
        const right = sort.key === "difficulty" ? difficulties.indexOf(b.difficulty) : b[sort.key];
        if (left === null) return right === null ? 0 : 1;
        if (right === null) return -1;
        return (typeof left === "string" ? left.localeCompare(right) : left - right) * factor || a.name.localeCompare(b.name);
    });
    container.className = "results-shell proficiency-page";
    container.innerHTML = `
        ${processed ? `<div class="proficiency-metrics">
            ${buildAnswer(`${session.isPartial ? "Known " : ""}Proficiency XP/h`, number(session.perHour), session.perHour === null ? "Duration unavailable; no hourly estimate." : "Measured hunt rate")}
            ${buildAnswer(`${session.isPartial ? "Known " : ""}Proficiency XP`, number(session.total), session.isPartial ? "Partial result — see issues below" : "Total across all creatures")}
            ${buildAnswer("Session duration", session.duration === null ? "—" : formatTime(session.duration))}
            ${buildAnswer("Kills", number(session.kills))}
        </div>` : buildEmptyState("No session analyzed yet.", "Paste a Hunt Analyzer above or open a stored session. Bestiary and Weapon Proficiency share the same sessions.")}
        ${session.isPartial ? `<details class="proficiency-warning" open><summary>Partial result · ${number(session.warnings.length)} data issues</summary><ul>${session.warnings.map((issue) => `<li>${escapeText(issue)}</li>`).join("")}</ul><p>Unclassified or invalid rows are excluded from known XP; contributions use the known subtotal.</p></details>` : ""}
        ${buildPlanner(session, plans, activeId, projectionCreature)}
        <section class="results-section" aria-labelledby="proficiencyBreakdownTitle">
            <h3 class="subsection-title" id="proficiencyBreakdownTitle">Creature breakdown</h3>
            ${rows.length ? `<div class="table-container proficiency-table" tabindex="0" role="region" aria-label="Creature proficiency breakdown, scroll horizontally for all columns">
                <table><caption class="sr-only">Proficiency XP by creature. Contributions are percentages of classified XP.</caption><thead><tr>${COLUMNS.map(([key, label]) => `<th scope="col" aria-sort="${sort.key === key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}"><button class="column-sort" type="button" data-proficiency-sort="${key}">${label}<span class="sort-mark">${sort.key === key ? (sort.direction === "asc" ? "▲" : "▼") : ""}</span></button></th>`).join("")}</tr></thead>
                <tbody>${rows.map((row) => `<tr><th scope="row">${escapeText(row.name)}${row.issue ? `<span class="row-aside">${escapeText(row.issue)}</span>` : ""}</th><td>${difficultyLabel(row.difficulty)}</td><td class="is-num">${number(row.kills)}</td><td class="is-num">${number(row.perKill)}</td><td class="is-num">${number(row.total)}</td><td class="is-num">${row.contribution === null ? "—" : `${row.contribution.toFixed(1)}%`}</td></tr>`).join("")}</tbody>
                <tfoot><tr><th scope="row">${session.isPartial ? "Known subtotal" : "Session total"}</th><td></td><td class="is-num">${number(session.kills)}</td><td></td><td class="is-num">${number(session.total)}</td><td class="is-num">${session.total === null ? "—" : session.total > 0 ? "100.0%" : "0.0%"}</td></tr></tfoot></table></div>
                <div class="library-controls proficiency-controls"><div><label class="input-label" for="proficiencyCreature">Optional kill projection · one creature only</label><select id="proficiencyCreature"><option value="">Select a classified creature</option>${rows.filter((row) => row.perKill !== null).map((row) => `<option value="${escapeAttribute(row.name)}" ${row.name === projectionCreature ? "selected" : ""}>${escapeText(row.name)} · ${number(row.perKill)} XP/kill</option>`).join("")}</select></div></div>` : buildEmptyState("No creature kills to calculate.", processed ? "Check the Killed Monsters section in the Hunt Analyzer." : "Process or reopen a session to see its creatures.")}
        </section>
        <details><summary>How Proficiency XP is calculated</summary><p class="helper-text">Kills × Bestiary Difficulty reward. Character experience, weapon combat skill, Bestiary completion and Charm Points do not change this calculation.</p>${buildStatLine(Object.entries(PROFICIENCY_BY_DIFFICULTY).map(([key, value]) => `${difficultyLabel(key)}: ${number(value)} XP/kill`))}</details>`;
}

export function buildProficiencyComparison(entries) {
    const rows = entries.filter((entry) => entry.proficiency);
    const ranked = [...rows].sort((a, b) => (b.proficiency.perHour ?? -1) - (a.proficiency.perHour ?? -1));
    const eligible = ranked.filter((entry) => !entry.proficiency.isPartial && entry.proficiency.perHour > 0);
    const bestRate = eligible[0]?.proficiency.perHour;
    return `<section class="results-section" aria-labelledby="proficiencyRankingTitle"><h3 class="subsection-title" id="proficiencyRankingTitle">Weapon Proficiency Ranking</h3>
        <p class="helper-text">Measured Proficiency XP/h, independent of character Experience XP/h and projected charm rate. Partial results cannot win the ranking.</p>
        ${ranked.length ? `<div class="table-container" tabindex="0" role="region" aria-label="Weapon proficiency session comparison"><table><thead><tr><th scope="col">Session</th><th scope="col">Proficiency XP/h</th><th scope="col">Proficiency XP</th><th scope="col">Kills</th><th scope="col">Duration</th></tr></thead><tbody>${ranked.map((entry) => {
            const value = entry.proficiency;
            const best = !value.isPartial && value.perHour > 0 && value.perHour === bestRate;
            return `<tr class="${best ? "is-best" : ""}"><td><button class="row-action" type="button" data-proficiency-open="${escapeAttribute(entry.id)}">${escapeText(entry.label)}</button> ${best ? buildPill("Best proficiency", true) : ""}${value.isPartial ? buildPill("Partial") : ""}</td><td>${number(value.perHour)}</td><td>${number(value.total)}</td><td>${number(value.kills)}</td><td>${value.duration === null ? "—" : formatTimeDetailed(value.duration)}</td></tr>`;
        }).join("")}</tbody></table></div>` : buildEmptyState("No processed sessions.", "Process a Hunt Analyzer to compare proficiency.")}</section>`;
}
