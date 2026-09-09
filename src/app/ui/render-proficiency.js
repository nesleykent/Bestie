import { PROFICIENCY_BY_BOSS_CATEGORY, PROFICIENCY_BY_DIFFICULTY, PROFICIENCY_ORDER, calculateWeaponProjection } from "../features/weapon-proficiency.js";
import { formatNumber, formatTime, formatTimeDetailed } from "../utils/formatters.js";
import { buildAnswer, buildEmptyState, buildPill, buildMetricLine, escapeAttribute } from "./render-blocks.js";
import { escapeText } from "./render-tracker.js";

const number = (value) => value === null ? "—" : formatNumber(value);
const classificationLabel = (value) => value ? value[0].toUpperCase() + value.slice(1) : "Unclassified";
const COLUMNS = [
    ["name", "Creature"], ["classification", "Classification"], ["kills", "Kills"],
    ["perKill", "Proficiency XP / Kill"], ["total", "Total Proficiency XP"], ["contribution", "Contribution %"]
];
/** Bosses share the breakdown with regular creatures, so the row says where its reward came from. */
const sourceNote = (source) => source === "bosstiary" ? '<span class="row-aside">Bosstiary</span>' : "";

export function buildWeaponProjection(plan, session, creatureName = "") {
    const currentXP = plan.currentXP.trim() === "" ? NaN : Number(plan.currentXP);
    const targetXP = plan.targetXP.trim() === "" ? NaN : Number(plan.targetXP);
    const creature = session.rows.find((row) => row.name === creatureName);
    const projection = calculateWeaponProjection({ currentXP, targetXP }, session, creature?.perKill);
    if (!projection) return `<p class="helper-text">${plan.targetXP.trim() === "" ? "Enter your target XP to estimate the remaining time." : "Use non-negative whole numbers for current and target XP."}</p>`;
    const time = projection.hoursRemaining === null ? "—" : formatTimeDetailed(projection.hoursRemaining * 60);
    return `${buildMetricLine([
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
            <div><label class="input-label" for="weaponName">Weapon name</label><input id="weaponName" data-weapon-field="name" type="text" maxlength="120" value="${escapeAttribute(plan.name)}" placeholder="e.g. My soulshredder"></div>
            <div><label class="input-label" for="weaponCurrentXP">Current Proficiency XP</label><input id="weaponCurrentXP" data-weapon-field="currentXP" type="number" min="0" step="1" max="${Number.MAX_SAFE_INTEGER}" value="${escapeAttribute(plan.currentXP)}"></div>
            <div><label class="input-label" for="weaponTargetXP">Target Proficiency XP</label><input id="weaponTargetXP" data-weapon-field="targetXP" type="number" min="0" step="1" max="${Number.MAX_SAFE_INTEGER}" value="${escapeAttribute(plan.targetXP)}" placeholder="Your manual target"></div>
        </div>
        <div class="proficiency-projection-control"><label class="input-label" for="proficiencyCreature">Estimate kills for one creature (optional)</label><select id="proficiencyCreature"><option value="">Select a classified creature or boss</option>${session.rows.filter((row) => row.perKill !== null).map((row) => `<option value="${escapeAttribute(row.name)}" ${row.name === projectionCreature ? "selected" : ""}>${escapeText(row.name)} · ${number(row.perKill)} XP/kill</option>`).join("")}</select></div>
        <div id="weaponProjection" role="status">${buildWeaponProjection(plan, session, projectionCreature)}</div>
        <p class="helper-text">Enter current and target XP from the game. Time estimates use this session’s rate and assume the weapon receives kill credit; current XP is never updated automatically.</p>
    </section>`;
}

export function renderProficiency(container, session, { processed, sort, plans, activeId, projectionCreature }) {
    const factor = sort.direction === "asc" ? 1 : -1;
    const rows = [...session.rows].sort((a, b) => {
        const leftMissing = a[sort.key] === null || (sort.key === "classification" && !a.classification);
        const rightMissing = b[sort.key] === null || (sort.key === "classification" && !b.classification);
        if (leftMissing || rightMissing) {
            if (leftMissing && rightMissing) return a.name.localeCompare(b.name);
            return leftMissing ? 1 : -1;
        }
        const left = sort.key === "classification" ? PROFICIENCY_ORDER.indexOf(a.classification) : a[sort.key];
        const right = sort.key === "classification" ? PROFICIENCY_ORDER.indexOf(b.classification) : b[sort.key];
        return (typeof left === "string" ? left.localeCompare(right) : left - right) * factor || a.name.localeCompare(b.name);
    });
    container.className = "results-shell proficiency-page";
    container.innerHTML = `
        ${processed ? `<div class="proficiency-metrics">
            ${buildAnswer(`${session.isPartial ? "Known " : ""}Proficiency XP/h`, number(session.perHour), session.duration === null ? "Duration unavailable; no hourly estimate." : session.perHour === null ? "Rate unavailable; see data issues." : "Measured hunt rate")}
            ${buildAnswer(`${session.isPartial ? "Known " : ""}Proficiency XP`, number(session.total), session.isPartial ? "Partial result — see issues below" : "Total across all creatures")}
            ${buildAnswer("Session duration", session.duration === null ? "—" : formatTime(session.duration))}
            ${buildAnswer("Kills", number(session.kills))}
        </div>` : buildEmptyState("No session analyzed yet.", "Paste a Hunt Analyzer above or open a stored session. Bestiary and Weapon Proficiency share the same sessions.")}
        ${session.isPartial ? `<section class="proficiency-warning" aria-label="Data issues"><h3 class="reference-title">Partial result · ${number(session.warnings.length)} data issues</h3><ul>${session.warnings.map((issue) => `<li>${escapeText(issue)}</li>`).join("")}</ul><p>Unclassified or invalid rows are excluded from known XP; contributions use the known subtotal.</p></section>` : ""}
        <section class="results-section" aria-labelledby="proficiencyBreakdownTitle">
            <h3 class="subsection-title" id="proficiencyBreakdownTitle">Creature and boss breakdown</h3>
            ${rows.length ? `<div class="mobile-table-sort">
                <div><label class="input-label" for="proficiencySort">Sort by</label><select id="proficiencySort">${COLUMNS.map(([key, label]) => `<option value="${key}"${sort.key === key ? " selected" : ""}>${label}</option>`).join("")}</select></div>
                <button class="text-action" id="proficiencySortDirection" type="button" data-proficiency-sort="${sort.key}" aria-label="Reverse contribution sort direction">${sort.direction === "asc" ? "Ascending ↑" : "Descending ↓"}</button>
            </div><div class="table-container proficiency-table" tabindex="0" role="region" aria-label="Creature and boss proficiency breakdown">
                <table><caption class="sr-only">Proficiency XP by creature and boss. Contributions are percentages of classified XP.</caption><thead><tr>${COLUMNS.map(([key, label]) => `<th scope="col" class="${["name", "classification"].includes(key) ? "" : "is-num"}" aria-sort="${sort.key === key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}"><button class="column-sort" type="button" data-proficiency-sort="${key}">${label}<span class="sort-mark">${sort.key === key ? (sort.direction === "asc" ? "▲" : "▼") : ""}</span></button></th>`).join("")}</tr></thead>
                <tbody>${rows.map((row) => `<tr><th scope="row">${escapeText(row.name)}${row.issue ? `<span class="row-aside">${escapeText(row.issue)}</span>` : ""}</th><td data-label="Classification">${classificationLabel(row.classification)}${sourceNote(row.source)}</td><td class="is-num" data-label="Kills">${number(row.kills)}</td><td class="is-num" data-label="XP / kill">${number(row.perKill)}</td><td class="is-num" data-label="Proficiency XP">${number(row.total)}</td><td class="is-num" data-label="Contribution">${row.contribution === null ? "—" : `${row.contribution.toFixed(1)}%`}${row.contribution === null ? "" : `<span class="contribution-bar" aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, row.contribution))}%"></span></span>`}</td></tr>`).join("")}</tbody>
                <tfoot><tr><th scope="row">${session.isPartial ? "Known subtotal" : "Session total"}</th><td></td><td class="is-num">${number(session.kills)}</td><td></td><td class="is-num">${number(session.total)}</td><td class="is-num">${session.total === null ? "—" : session.total > 0 ? "100.0%" : "0.0%"}</td></tr></tfoot></table></div>
` : buildEmptyState("No kills to calculate.", processed ? "Check the Killed Monsters section in the Hunt Analyzer." : "Process or reopen a session to see its creatures.")}
        </section>
        ${buildPlanner(session, plans, activeId, projectionCreature)}
        <section class="reference-section" aria-labelledby="proficiencyMethodTitle"><h3 class="reference-title" id="proficiencyMethodTitle">How Proficiency XP is calculated</h3><p class="helper-text">Kills × Bestiary Difficulty reward for regular creatures, and Kills × Bosstiary category reward for bosses. Character experience, weapon combat skill, Bestiary completion and Charm Points do not change this calculation.</p>${buildMetricLine(Object.entries(PROFICIENCY_BY_DIFFICULTY).map(([key, value]) => `${classificationLabel(key)}: ${number(value)} XP/kill`))}${buildMetricLine(Object.entries(PROFICIENCY_BY_BOSS_CATEGORY).map(([key, value]) => `${classificationLabel(key)}: ${number(value)} XP/kill`))}</section>`;
}

export function buildProficiencyComparison(entries) {
    const rows = entries.filter((entry) => entry.proficiency);
    const ranked = [...rows].sort((a, b) => (b.proficiency.perHour ?? -1) - (a.proficiency.perHour ?? -1));
    const eligible = ranked.filter((entry) => !entry.proficiency.isPartial && entry.proficiency.perHour > 0);
    const bestRate = eligible[0]?.proficiency.perHour;
    return `<section class="results-section" aria-labelledby="proficiencyRankingTitle"><h3 class="subsection-title" id="proficiencyRankingTitle">Weapon Proficiency Ranking</h3>
        <p class="helper-text">Measured Proficiency XP/h, independent of character Experience XP/h and projected charm rate. Partial results cannot win the ranking.</p>
        ${ranked.length ? `<div class="table-container" tabindex="0" role="region" aria-label="Weapon proficiency session comparison"><table><thead><tr><th scope="col">Session</th><th scope="col" class="is-num">Proficiency XP/h</th><th scope="col" class="is-num">Proficiency XP</th><th scope="col" class="is-num">Kills</th><th scope="col" class="is-num">Duration</th></tr></thead><tbody>${ranked.map((entry) => {
            const value = entry.proficiency;
            const best = !value.isPartial && value.perHour > 0 && value.perHour === bestRate;
            return `<tr class="${best ? "is-best" : ""}"><td><button class="row-action" type="button" data-proficiency-open="${escapeAttribute(entry.id)}">${escapeText(entry.label)}</button> ${best ? buildPill("Best proficiency", true) : ""}${value.isPartial ? buildPill("Partial") : ""}</td><td class="is-num">${number(value.perHour)}</td><td class="is-num">${number(value.total)}</td><td class="is-num">${number(value.kills)}</td><td class="is-num">${value.duration === null ? "—" : formatTimeDetailed(value.duration)}</td></tr>`;
        }).join("")}</tbody></table></div>` : buildEmptyState("No processed sessions.", "Process a Hunt Analyzer to compare proficiency.")}</section>`;
}
