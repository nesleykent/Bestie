import catalog from "../../data/hunt-grounds.json" with { type: "json" };
import { rankHuntGrounds } from "../features/hunt-planner.js";
import { escapeAttribute as escape } from "./render-blocks.js";
import { formatNumber } from "../utils/formatters.js";

const select = (id,label,options,value) => `<label class="tool-field" for="${id}"><span class="input-label">${label}</span><select id="${id}" name="${id}">${options.map(([key,text])=>`<option value="${key}" ${value === key ? "selected" : ""}>${text}</option>`).join("")}</select></label>`;
export function renderHuntPlanner(container, inputs, hunts, onChange) {
    const value = (key,fallback="")=>inputs[key] ?? fallback;
    let page = 0;
    const perPage = 25;
    const parseLinks = () => { try { const links=JSON.parse(inputs.groundSessions ?? "{}"); return links && typeof links === "object" && !Array.isArray(links) ? links : {}; } catch { return {}; } };
    container.insertAdjacentHTML("beforeend", `<p class="helper-text">${catalog.grounds.length} curated vocation/hunt entries from <a href="https://tibiapal.com/hunting" target="_blank" rel="noopener noreferrer">TibiaPal</a>. Missing rates stay unknown. Reference profit uses market assumptions that vary by world; a recommended minimum level does not guarantee safety or access.</p>
        <form id="huntPlannerForm"><div class="tool-fields"><label class="tool-field" for="groundLevel"><span class="input-label">Character level (optional)</span><input type="text" inputmode="numeric" id="groundLevel" name="groundLevel" value="${escape(value("groundLevel"))}" placeholder="All levels"></label>
        ${select("groundVocation","Vocation",[["","All vocations"],...["knight","paladin","monk","sorcerer","druid"].map(key=>[key,key])],value("groundVocation"))}
        ${select("groundParty","Party",[["all","All"],["solo","Solo"],["team","Team"]],value("groundParty","all"))}
        ${select("groundObjective","Objective",[["experience","Raw experience / hour"],["profit","Profit / hour"]],value("groundObjective","experience"))}
        ${select("groundEvidence","Rank using",[["reference","Reference observations"],["measured","My measured sessions"]],value("groundEvidence","reference"))}
        ${select("groundRespawn","Measured respawn mode",[["regular","Regular"],["rapid","Rapid Respawn"]],value("groundRespawn","regular"))}
        <label class="tool-field" for="groundQuery"><span class="input-label">Place or hunting context</span><input type="text" id="groundQuery" name="groundQuery" value="${escape(value("groundQuery"))}"></label></div><button class="btn btn-primary" type="submit">Compare hunts</button></form>
        <p id="groundFeedback" role="status" aria-live="polite"></p><div id="groundResults"></div>
        <details><summary>Link measured sessions to a hunt ground</summary><p class="helper-text">You choose the ground explicitly. Names alone do not establish a match. Only processed raw XP/h or profit/h in the selected respawn mode contributes; drafts and reference XP/h never become creature kill rates.</p>
        <label class="input-label" for="groundSession">Saved session</label><select id="groundSession"><option value="">Choose a processed session</option>${hunts.filter(h=>h.hasProcessedLog).map(h=>`<option value="${escape(h.id)}">${escape(h.name || `Session ${hunts.indexOf(h)+1}`)}</option>`).join("")}</select>
        <label class="input-label" for="groundLink">Ground and vocation</label><select id="groundLink"><option value="">No linked ground</option>${catalog.grounds.map(g=>`<option value="${g.id}">${escape(g.place)} · ${g.vocation ?? "team"} · ${g.minLevel} · ${escape(g.context)}</option>`).join("")}</select><button class="btn" id="groundLinkSave" type="button">Save session link</button></details>`);
    const form=container.querySelector("#huntPlannerForm");
    const feedback=container.querySelector("#groundFeedback");
    const results=container.querySelector("#groundResults");
    const render=()=>{
        const data=Object.fromEntries(new FormData(form));
        try {
            if(data.groundLevel.trim() && !/^\d+$/.test(data.groundLevel.trim())) throw new Error("Level must be a positive whole number.");
            const ranked=rankHuntGrounds(catalog.grounds,{level:data.groundLevel.trim()?Number(data.groundLevel):null,vocation:data.groundVocation,partySize:data.groundParty,query:data.groundQuery,objective:data.groundObjective,evidence:data.groundEvidence,respawnMode:data.groundRespawn},{hunts,links:parseLinks()});
            const rows=ranked.slice(page*perPage,(page+1)*perPage);
            feedback.textContent=`${ranked.length} matching entries. ${ranked.filter(r=>r.value!==null).length} have a rate in the selected evidence. Showing ${ranked.length ? page*perPage+1 : 0}–${Math.min((page+1)*perPage,ranked.length)}.`;
            results.innerHTML=`<div class="table-container record-table" tabindex="0" role="region" aria-label="Hunt ground comparison"><table><thead><tr><th>Hunt ground</th><th>Context</th><th>${data.groundObjective === "experience" ? "Raw XP/h" : "Profit/h (gp)"}</th><th>Evidence</th></tr></thead><tbody>${rows.map(({ground:g,value,measured,reasons})=>`<tr><th scope="row">${escape(g.place)}${g.referenceVideoUrl?` <a href="${escape(g.referenceVideoUrl)}" target="_blank" rel="noopener noreferrer">Video</a>`:""}</th><td>${escape(g.vocation ?? "team")} · ${g.minLevel}<br>${escape(g.context || "Composition not specified")}</td><td>${value === null ? "Not reported" : formatNumber(value)}</td><td>${escape(reasons[2])}${measured.sessions.length && data.groundEvidence === "measured"?` · ${formatNumber(measured.minutes)} min`:""}</td></tr>`).join("")}</tbody></table></div><div class="tool-fields"><button class="btn" type="button" id="groundPrevious" ${page===0?"disabled":""}>Previous 25</button><button class="btn" type="button" id="groundNext" ${(page+1)*perPage>=ranked.length?"disabled":""}>Next 25</button></div>`;
            results.querySelector("#groundPrevious").addEventListener("click",()=>{page--;render();});
            results.querySelector("#groundNext").addEventListener("click",()=>{page++;render();});
        } catch(error) { feedback.textContent=error.message;results.innerHTML=""; }
    };
    form.addEventListener("input",()=>{const values=Object.fromEntries(new FormData(form));Object.assign(inputs,values);onChange(values);});
    form.addEventListener("submit",event=>{event.preventDefault();page=0;render();});
    const session=container.querySelector("#groundSession");const link=container.querySelector("#groundLink");
    session.addEventListener("change",()=>{link.value=parseLinks()[session.value] ?? "";});
    container.querySelector("#groundLinkSave").addEventListener("click",()=>{
        if(!session.value){feedback.textContent="Choose a processed session to link.";return;}
        const links=parseLinks();if(link.value)links[session.value]=link.value;else delete links[session.value];
        const patch={groundSessions:JSON.stringify(links)};Object.assign(inputs,patch);onChange(patch);page=0;render();
    });
    render();
}
