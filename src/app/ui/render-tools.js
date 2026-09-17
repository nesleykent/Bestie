import { ELEMENTS, experienceForLevel, projectExperience, parseStamina, staminaRecovery, staminaUsage, elementalDamage } from "../features/calculators.js";
import { escapeAttribute as escape } from "./render-blocks.js";
import { formatNumber, formatTimeDetailed } from "../utils/formatters.js";

export const TOOL_LABELS = { experience: "XP & Level", stamina: "Stamina", elemental: "Elemental Damage" };
const field = (id, label, value, options = {}) => `<label class="tool-field" for="${id}"><span class="input-label">${label}</span><input id="${id}" name="${id}" type="${options.type ?? "text"}" ${options.numeric ? 'inputmode="decimal"' : ""} value="${escape(value)}" ${options.placeholder ? `placeholder="${escape(options.placeholder)}"` : ""}></label>`;
const metrics = rows => `<dl class="tool-results">${rows.map(([label, value]) => `<div><dt class="input-label">${label}</dt><dd>${escape(value)}</dd></div>`).join("")}</dl>`;
const numeric = (value, label) => {
    if (!/^\d+(?:\.\d+)?$/.test(String(value).trim())) throw new Error(`${label} must be a nonnegative number.`);
    const result = Number(value);
    if (!Number.isFinite(result)) throw new Error(`${label} is too large.`);
    return result;
};

export function renderTools(container, { view, inputs, creatures, onChange }) {
    container.className = "results-shell";
    const value = (key, fallback = "") => inputs[key] ?? fallback;
    let form = "";
    let help = "";
    if (view === "experience") {
        form = field("xpLevel", "Current level", value("xpLevel", "100"), { numeric: true })
            + field("xpCurrent", "Current total XP (optional)", value("xpCurrent"), { numeric: true, placeholder: "Use level starting XP" })
            + field("xpTarget", "Target level", value("xpTarget", "101"), { numeric: true })
            + field("xpRate", "Observed XP per hour (optional)", value("xpRate"), { numeric: true });
        help = "Uses your exact total XP when supplied. Otherwise starts at the beginning of the current level. Time assumes the observed rate stays constant; no experience bonuses are inferred.";
    } else if (view === "stamina") {
        form = field("staminaHunt", "Planned hunting time (minutes)", value("staminaHunt", "0"), { numeric: true })
            + field("staminaCurrent", "Current stamina (hours:minutes)", value("staminaCurrent", "39:00"))
            + field("staminaTarget", "Target stamina (hours:minutes)", value("staminaTarget", "42:00"))
            + field("staminaDelay", "Remaining recovery delay (minutes)", value("staminaDelay", "10"), { numeric: true });
        help = "Offline recovery: 3 minutes per stamina minute up to 39:00, then 6 up to 42:00. A fresh logout has a 10-minute delay. Adjust the remaining delay if already resting. Hunting consumes one stamina minute per active minute. Recovery starts after the planned hunt and assumes uninterrupted rest.";
    } else {
        form = `<label class="tool-field" for="damageCreature"><span class="input-label">Creature</span><input type="text" id="damageCreature" name="damageCreature" list="damageCreatures" value="${escape(value("damageCreature"))}" placeholder="Choose a Bestiary creature"><datalist id="damageCreatures">${creatures.map(creature => `<option value="${escape(creature.Name)}"></option>`).join("")}</datalist></label>`
            + ELEMENTS.map(element => field(`damage_${element}`, `${element[0].toUpperCase() + element.slice(1)} base damage`, value(`damage_${element}`, "0"), { numeric: true })).join("");
        help = "Enter pre-resistance damage for each component of an attack. Dataset percentages describe damage received: 100% is neutral. Results apply elemental modifiers only; armor, shielding, mitigation, charms, critical hits and rounding are not simulated.";
    }
    container.innerHTML = `<nav class="session-analysis-nav" aria-label="Tools">${Object.entries(TOOL_LABELS).map(([key, label]) => `<a href="#tools/${key}" ${key === view ? 'aria-current="page"' : ""}>${label}</a>`).join("")}</nav>
        <form id="toolForm"><div class="tool-fields">${form}</div><p class="helper-text">${help}</p><button class="btn btn-primary" type="submit">Calculate</button></form>
        <div id="toolResult" role="status" aria-live="polite"></div>`;
    const formElement = container.querySelector("form");
    const result = container.querySelector("#toolResult");
    const calculate = () => {
        const data = Object.fromEntries(new FormData(formElement));
        try {
            if (view === "experience") {
                const xp = data.xpCurrent.trim() ? numeric(data.xpCurrent, "Current XP") : experienceForLevel(numeric(data.xpLevel, "Current level"));
                const projection = projectExperience({ experience: xp, targetLevel: numeric(data.xpTarget, "Target level"), hourlyRate: data.xpRate.trim() ? numeric(data.xpRate, "XP/h") : null });
                result.innerHTML = metrics([["Current level", `${projection.level} · ${(projection.progress * 100).toFixed(2)}% to next level`], ["Target total XP", formatNumber(projection.targetExperience)], ["XP remaining", formatNumber(projection.remaining)], ["Estimated hunt time", projection.hours === null ? "Enter a positive XP/h rate" : formatTimeDetailed(projection.hours * 60)]]);
            } else if (view === "stamina") {
                const huntMinutes = numeric(data.staminaHunt, "Planned hunting time");
                const usage = staminaUsage(parseStamina(data.staminaCurrent), huntMinutes);
                const recovery = staminaRecovery({ current: usage.after, target: parseStamina(data.staminaTarget), delay: numeric(data.staminaDelay, "Delay") });
                const ready = new Date(Date.now() + (huntMinutes + recovery.minutes) * 60_000);
                result.innerHTML = metrics([["Stamina after hunt", formatTimeDetailed(usage.after)], ["Hunting time available now", formatTimeDetailed(usage.available)], ["Time above 39:00 now", formatTimeDetailed(usage.bonusAvailable)], ["Time remaining", formatTimeDetailed(recovery.minutes)], ["Ready at", Number.isFinite(ready.getTime()) ? ready.toLocaleString() : "Date exceeds supported range"], ["Recovery breakdown", `${recovery.normal} normal + ${recovery.bonus} bonus stamina minutes; ${recovery.delay} min delay`]]) + (usage.unsupportedMinutes ? `<p>Planned hunting exceeds current stamina by ${formatTimeDetailed(usage.unsupportedMinutes)}.</p>` : "");
            } else {
                const creature = creatures.find(item => item.Name.toLowerCase() === data.damageCreature.trim().toLowerCase());
                const damage = elementalDamage(creature, Object.fromEntries(ELEMENTS.map(element => [element, numeric(data[`damage_${element}`], `${element} damage`)])));
                result.innerHTML = metrics([["Creature", creature.Name], ["Hit points", creature.combat?.hitpoints === null ? "Unknown" : formatNumber(creature.combat.hitpoints)], ["Adjusted attack damage", damage.total === null ? `Unavailable: missing ${damage.unknown.join(", ")} resistance` : formatNumber(damage.total)]])
                    + `<div class="table-container record-table" tabindex="0" role="region" aria-label="Elemental breakdown"><table><thead><tr><th>Element</th><th>Base</th><th>Damage received</th><th>Adjusted</th></tr></thead><tbody>${damage.rows.map(row => `<tr><th scope="row">${row.element}</th><td>${formatNumber(row.base)}</td><td>${row.percent === null ? "Unknown" : `${row.percent}%`}</td><td>${row.damage === null ? "Unknown" : formatNumber(row.damage)}</td></tr>`).join("")}</tbody></table></div>`;
            }
        } catch (error) { result.textContent = error.message; }
    };
    formElement.addEventListener("input", () => onChange(Object.fromEntries(new FormData(formElement))));
    formElement.addEventListener("submit", event => { event.preventDefault(); calculate(); });
    if (view !== "elemental" || value("damageCreature")) calculate();
}
