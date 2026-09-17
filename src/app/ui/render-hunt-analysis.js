import { escapeAttribute as escape } from "./render-blocks.js";
import { formatNumber, formatTimeDetailed } from "../utils/formatters.js";
import { compareHuntMetrics, getFullHuntAnalysis } from "../features/hunt-analysis.js";

const METRICS = [
    ["experience", "Experience", "XP"], ["xpPerHour", "Experience / hour", "XP/h"],
    ["rawExperience", "Raw experience", "XP"], ["rawXpPerHour", "Raw experience / hour", "XP/h"],
    ["loot", "Loot", "gp"], ["supplies", "Supplies", "gp"], ["balance", "Profit / loss", "gp"],
    ["damage", "Damage", ""], ["damagePerHour", "Damage / hour", "/h"],
    ["healing", "Healing", ""], ["healingPerHour", "Healing / hour", "/h"]
];
const RANKINGS = [["xpPerHour", "XP/h"], ["rawXpPerHour", "Raw XP/h"], ["profitPerHour", "Profit/h"], ["damagePerHour", "Damage/h"], ["healingPerHour", "Healing/h"]];
const number = (value, unit = "") => value === null ? "Not reported" : `${formatNumber(value)} ${unit}`.trim();
const table = (label, headings, rows) => `<div class="table-container record-table" tabindex="0" role="region" aria-label="${escape(label)}"><table><thead><tr>${headings.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;

export function renderHuntAnalysis(container, hunt, hunts, metric = "xpPerHour") {
    container.className = "results-shell";
    const analysis = getFullHuntAnalysis(hunt);
    if (!analysis) {
        container.innerHTML = `<p class="helper-text">${hunt.hasProcessedLog ? "Reprocess this saved log once to capture full measurements. Existing Bestiary and proficiency evidence is preserved." : "Paste and process a Hunt Analyzer to inspect experience, costs, combat, kills and drops."}</p>`;
        return;
    }
    const issues = [...analysis.issues, ...analysis.metricIssues];
    const ranking = compareHuntMetrics(hunts, hunt.respawnMode, metric);
    container.innerHTML = `
        ${analysis.hasDraft ? '<p class="helper-text" role="status">The log has unprocessed edits. These results use the last processed version.</p>' : ""}
        ${issues.length ? `<div role="status"><strong>Review this evidence</strong><ul>${issues.map(issue => `<li>${escape(issue)}</li>`).join("")}</ul></div>` : ""}
        <p class="stat-line">${formatTimeDetailed(analysis.sessionDuration)} · ${escape(hunt.respawnMode === "rapid" ? "Rapid Respawn" : "Regular Respawn")} · ${analysis.monsters.length} creature types · ${number(analysis.profitPerHour, "gp/h")}</p>
        <section class="results-section" aria-label="Session measurements">
        ${table("Session measurements", ["Measurement", "Value", "Evidence"], METRICS.map(([key, label, unit]) => `<tr><th scope="row">${label}</th><td class="is-num">${number(analysis.metrics[key], unit)}</td><td>${analysis.metrics[key] === null ? "Unavailable" : analysis.derivedMetrics.includes(key) ? "Calculated from reported totals" : "Reported by analyzer"}</td></tr>`))}
        </section>
        <section class="results-section"><h3 class="subsection-title">Killed monsters</h3>
        ${table("All logged kills", ["Creature", "Kills", "Kills/h"], analysis.monsters.map(row => `<tr><th scope="row">${escape(row.name)}</th><td>${formatNumber(row.killsThisSession)}</td><td>${analysis.sessionDuration > 0 ? number(row.killsThisSession * 60 / analysis.sessionDuration) : "Unavailable"}</td></tr>`))}</section>
        <section class="results-section"><h3 class="subsection-title">Looted items</h3>
        ${analysis.drops.length ? table("Looted items", ["Item", "Count"], analysis.drops.map(row => `<tr><th scope="row">${escape(row.name)}</th><td>${formatNumber(row.count)}</td></tr>`)) : '<p>No item rows reported.</p>'}</section>
        <section class="results-section"><h3 class="subsection-title">Compare performance</h3>
        <label class="input-label" for="huntMetric">Rank by</label><select id="huntMetric">${RANKINGS.map(([key, label]) => `<option value="${key}" ${key === metric ? "selected" : ""}>${label}</option>`).join("")}</select>
        <p class="helper-text">Only ${escape(hunt.respawnMode === "rapid" ? "Rapid Respawn" : "Regular Respawn")} sessions with complete, valid measurements for this metric are ranked. Rates describe observed conditions.</p>
        ${table("Performance ranking", ["Session", "Measured rate", "Duration"], ranking.map(({hunt: candidate, analysis: result, value}) => `<tr><th scope="row"><button class="link-button" type="button" data-analysis-session="${escape(candidate.id)}">${escape(candidate.name || `Session ${hunts.indexOf(candidate) + 1}`)}</button></th><td>${number(value)}</td><td>${formatTimeDetailed(result.sessionDuration)}</td></tr>`))}
        </section>`;
}
