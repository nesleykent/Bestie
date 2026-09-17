import { parseMorningTibia } from "../features/morning-tibia.js";
import catalog from "../../data/world-changes.json" with { type: "json" };
import { escapeAttribute as escape } from "./render-blocks.js";

const definitions = [...catalog.worldChanges, ...catalog.miniWorldChanges];
function describe(entry) {
    if (entry.status === "unknown") return "Unknown";
    if (entry.status === "conflict") return "Conflicting board evidence";
    const definition = definitions.find(row => row.id === entry.id);
    if (entry.kind === "world-change") {
        return `${entry.status === "tentative" ? "Tentative: " : ""}${definition.states.find(row => row.id === entry.variant)?.label ?? "Unknown"}`;
    }
    if (!entry.evidence.some(row => row.source === "board")) return "Inactive (complete board)";
    return entry.variant ? `Active · ${definition.variants.find(row => row.id === entry.variant)?.label ?? entry.variant}` : "Active · variant not reported";
}

export function renderMorningTool(container, inputs, onChange) {
    container.insertAdjacentHTML("beforeend", `<p class="helper-text">Paste a World Board reading or Guide NPC replies. A complete board can establish inactive announced changes; a fragment only proves what it names. Unverified reference wording stays tentative. Text and corrections remain with this local character.</p>
        <form id="morningForm"><div class="tool-fields"><label class="tool-field" for="morningWorld"><span class="input-label">Observed world</span><input type="text" name="morningWorld" id="morningWorld" required value="${escape(inputs.morningWorld ?? "")}" placeholder="World name"></label><label class="tool-field" for="morningDate"><span class="input-label">Observed on</span><input type="date" name="morningDate" id="morningDate" required value="${escape(inputs.morningDate ?? new Date().toLocaleDateString("en-CA"))}"></label></div>
        <label class="input-label" for="morningLog">World Board / Guide text</label><textarea id="morningLog" name="morningLog" rows="6">${escape(inputs.morningLog ?? "")}</textarea>
        <label class="tool-field"><span><input type="checkbox" id="morningFull" ${inputs.morningFull === "true" ? "checked" : ""}> This is the entire board reading, even if I omitted its opening line</span></label><div><button class="btn btn-primary" type="submit">Read world changes</button></div></form>
        <p id="morningFeedback" role="status" aria-live="polite"></p><div id="morningResults"></div>`);
    const form = container.querySelector("#morningForm");
    const feedback = container.querySelector("#morningFeedback");
    const output = container.querySelector("#morningResults");
    const save = patch => { Object.assign(inputs,patch); onChange(patch); };
    const overrides = () => {
        try { const data = JSON.parse(inputs.morningOverrides ?? "{}"); return data && typeof data === "object" && !Array.isArray(data) ? data : {}; }
        catch { return {}; }
    };
    const render = () => {
        if (!inputs.morningProcessedLog) { output.textContent = "No world observation processed yet."; return; }
        const result = parseMorningTibia(inputs.morningProcessedLog,{world:inputs.morningProcessedWorld,fullBoard:inputs.morningProcessedFull === "true"});
        const manual = overrides();
        const known = result.entries.filter(entry => entry.status === "known").length;
        output.innerHTML = `<p class="stat-line">${escape(result.world)} · observed ${escape(inputs.morningProcessedDate)} · ${known} of ${result.entries.length} resolved from text</p><p class="helper-text">This is a saved observation, not a live world status. Current draft edits do not alter the processed evidence. Manual corrections are labelled separately and reset when you process a new observation.</p>
            ${result.issues.length ? `<ul>${result.issues.map(issue => `<li>${escape(issue.message ?? (issue.code === "conflict" ? `Conflicting board variants: ${issue.name}` : issue.text ?? issue.code))}</li>`).join("")}</ul>` : ""}
            <div class="table-container record-table" tabindex="0" role="region" aria-label="World changes"><table><thead><tr><th>Change</th><th>Observed state</th><th>Evidence / correction</th></tr></thead><tbody>${[...result.entries].sort((a,b) => Number(a.status === "unknown") - Number(b.status === "unknown")).map(entry => {
                const def = definitions.find(row=>row.id===entry.id);
                const states = entry.kind === "world-change" ? def.states : [{id:"active",label:"Active"},{id:"inactive",label:"Inactive"}];
                const options = [{id:"",label:"Use parsed evidence"},{id:"unknown",label:"Unknown"},...states];
                const selected = options.some(row=>row.id === manual[entry.id]) ? manual[entry.id] : "";
                const label = selected ? `Manual: ${options.find(row=>row.id === selected).label}` : describe(entry);
                return `<tr><th scope="row">${escape(entry.name)}<span class="cell-muted">${entry.kind === "world-change" ? ` · Guide: ${escape(def.guideKeyword)}` : " · Board"}</span></th><td>${escape(label)}</td><td><details><summary>Evidence and correction</summary>${entry.evidence.length ? entry.evidence.map(e=>`<p>${escape(e.text)}</p>`).join("") : "<p>No matching evidence.</p>"}<label class="input-label" for="morning-override-${entry.id}">Manual state</label><select id="morning-override-${entry.id}" data-morning-override="${entry.id}">${options.map(option=>`<option value="${option.id}" ${selected===option.id ? "selected" : ""}>${escape(option.label)}</option>`).join("")}</select></details></td></tr>`;
            }).join("")}</tbody></table></div>`;
        output.querySelectorAll("[data-morning-override]").forEach(select=>select.addEventListener("change",()=>{
            const changes = overrides(); changes[select.dataset.morningOverride] = select.value;
            save({morningOverrides:JSON.stringify(changes)});
            const row = select.closest("tr"); row.children[1].textContent = select.value ? `Manual: ${select.selectedOptions[0].textContent}` : describe(result.entries.find(entry=>entry.id===select.dataset.morningOverride));
            feedback.textContent = "Manual correction saved locally.";
        }));
    };
    form.addEventListener("input",()=>save({...Object.fromEntries(new FormData(form)),morningFull:String(container.querySelector("#morningFull").checked)}));
    form.addEventListener("submit",event=>{
        event.preventDefault();
        const values = Object.fromEntries(new FormData(form));
        if (!values.morningWorld.trim() || !values.morningLog.trim()) { feedback.textContent="Enter the observed world and copied game text."; return; }
        const full = String(container.querySelector("#morningFull").checked);
        const result = parseMorningTibia(values.morningLog,{world:values.morningWorld.trim(),fullBoard:full === "true"});
        if (!result.entries.some(entry=>entry.status !== "unknown")) { feedback.textContent="No recognizable world-change evidence. Previous observation is unchanged."; return; }
        save({...values,morningFull:full,morningProcessedLog:values.morningLog,morningProcessedWorld:values.morningWorld.trim(),morningProcessedDate:values.morningDate,morningProcessedFull:full,morningOverrides:"{}"});
        feedback.textContent="Observation saved. Review unresolved or tentative entries below.";render();
    });
    render();
}
