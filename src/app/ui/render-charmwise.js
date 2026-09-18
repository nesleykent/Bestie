import { buildCharmAdvice } from "../features/charmwise.js";
import { escapeAttribute as escape } from "./render-blocks.js";
import { formatNumber } from "../utils/formatters.js";
export function renderCharmwise(container,{inputs,creatures,charms,progress,onChange}) {
    container.insertAdjacentHTML("beforeend",`<p class="helper-text">Compare next-stage costs, creature affinity and situational effects using your <a href="#trackers/charms">Charms</a> and <a href="#trackers/bestiary">Bestiary</a> records. This is decision support; it never spends points or assigns charms in the client.</p>
    <form id="charmwiseForm"><div class="tool-fields"><label class="tool-field" for="charmCreature"><span class="input-label">Hunting target (optional)</span><input type="text" id="charmCreature" name="charmCreature" list="charmCreatures" value="${escape(inputs.charmCreature??"")}"><datalist id="charmCreatures">${creatures.map(c=>`<option value="${escape(c.Name)}"></option>`).join("")}</datalist></label>
    <label class="tool-field" for="charmIntent"><span class="input-label">Priority</span><select id="charmIntent" name="charmIntent">${["damage","defence","utility"].map(key=>`<option value="${key}" ${key===(inputs.charmIntent??"damage")?"selected":""}>${key}</option>`).join("")}</select></label>
    <label class="tool-field" for="charmPoints"><span class="input-label">Available charm points (optional)</span><input type="text" inputmode="numeric" name="charmPoints" id="charmPoints" value="${escape(inputs.charmPoints??"")}" placeholder="Use recorded balance"></label>
    <label class="tool-field" for="charmEchoes"><span class="input-label">Available echoes (optional)</span><input type="text" inputmode="numeric" name="charmEchoes" id="charmEchoes" value="${escape(inputs.charmEchoes??"")}" placeholder="Use recorded balance"></label></div>
    <label class="tool-field"><span><input id="charmPromoted" type="checkbox" ${inputs.charmPromoted==="true"?"checked":""}> Include 100 promotion echoes in the recorded balance</span></label><button class="btn btn-primary" type="submit">Compare charms</button></form><div id="charmwiseResults" aria-live="polite"></div>`);
    const form=container.querySelector("#charmwiseForm");const output=container.querySelector("#charmwiseResults");
    const data=()=>({...Object.fromEntries(new FormData(form)),charmPromoted:String(container.querySelector("#charmPromoted").checked)});
    const render=()=>{
        try{
            const values=data();
            const budget=(value)=>{if(!value.trim())return null;if(!/^\d+$/.test(value.trim()))throw new Error("Available balances must be nonnegative whole numbers.");return Number(value);};
            if(values.charmCreature.trim()&&!creatures.some(row=>row.Name.toLowerCase()===values.charmCreature.trim().toLowerCase()))throw new Error("Choose a creature from the Bestiary list.");
            const creatureName=creatures.find(row=>row.Name.toLowerCase()===values.charmCreature.trim().toLowerCase())?.Name??"";
            const result=buildCharmAdvice({charms,creatures,progress,creatureName,availablePoints:budget(values.charmPoints),availableEchoes:budget(values.charmEchoes),promoted:values.charmPromoted==="true",intent:values.charmIntent});
            output.innerHTML=`<dl class="tool-results">${Object.entries(result.budgets).map(([currency,b])=>`<div><dt class="input-label">Available ${currency}</dt><dd>${formatNumber(b.amount)} · ${escape(b.source)}${b.confirmed?"":" (incomplete records)"}${b.overspent?" · recorded spending exceeds earnings":""}</dd></div>`).join("")}</dl><p class="helper-text">${result.unknownStages} charm stages and ${result.unknownBestiary} Bestiary entries are not recorded. An optional available balance confirms funds, but never guesses a missing charm stage. Affinity compares elemental damage received only; it is not a DPS forecast or a universal best-charm ranking.</p>
            ${result.creature?`<p>${escape(result.creature.Name)} · ${result.creatureProgress.isComplete?"Bestiary complete: eligible for charm assignment":"Complete and verify this Bestiary entry before assigning a charm"}</p>`:""}
            ${["Major","Minor"].map(type=>`<h3>${type} charms</h3><div class="table-container record-table" tabindex="0" role="region" aria-label="${type} charm advice"><table><thead><tr><th>Charm / stage</th><th>Next cost</th><th>Effect</th><th>Why consider it</th></tr></thead><tbody>${result.candidates.filter(row=>row.type===type).map(row=>`<tr><th scope="row">${escape(row.name)}<br><span class="cell-muted">${row.known?`Stage ${row.stage}`:"Stage not recorded"}</span></th><td>${row.next?`${formatNumber(row.next.cost)} ${row.currency}<br>${row.affordable===null?"Verify stage / balance":row.affordable?"Within available balance":"More currency needed"}`:"Maxed"}</td><td>${escape(row.effect)}</td><td>${row.reasons.map(reason=>escape(reason)).join(" ")}</td></tr>`).join("")}</tbody></table></div>`).join("")}`;
        }catch(error){output.textContent=error.message;}
    };
    form.addEventListener("input",()=>{const values=data();Object.assign(inputs,values);onChange(values);});
    form.addEventListener("submit",event=>{event.preventDefault();render();});render();
}
