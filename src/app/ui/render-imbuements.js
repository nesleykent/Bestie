import historyDocument from '../../data/public-history.json' with {type:'json'};
import marketDocument from '../../data/market-watch.json' with {type:'json'};
import {getMaterialQuotes} from '../features/market-prices.js';
import { IMBUEMENTS, TIER_ORDER, TIER_FEES, GOLD_TOKEN_ITEM_ID, getCumulativeMaterials, calculateImbuement, evaluateBreakEven } from '../features/imbuements.js';
import { escapeAttribute as escape } from './render-blocks.js';
import { formatNumber } from '../utils/formatters.js';
const money=n=>n===null?'Unavailable':`${formatNumber(n)} gp`;
const priceKey=id=>`imb_price_${id}`;
export function renderImbuements(container,{inputs,onChange}) {
 const chosen=IMBUEMENTS.find(i=>i.id===inputs.imbRecipe)??IMBUEMENTS[0];
 const materials=getCumulativeMaterials(chosen.id,'powerful');
 if(chosen.supportsGoldTokenExchange)materials.push({itemId:GOLD_TOKEN_ITEM_ID,name:'Gold Token',quantity:null});
 const quotes=getMaterialQuotes(materials,historyDocument,marketDocument);
 container.insertAdjacentHTML('beforeend',`<p class="helper-text">Compare materials, token packages and mixed purchases for all three tiers. Current shrine fees guarantee 100% success. Each application lasts 20 active hours. Prices are your local inputs; blank means unknown, and zero means you explicitly value an owned material at zero.</p>
 <form id="imbueForm"><label class="tool-field" for="imbRecipe"><span class="input-label">Imbuement</span><select id="imbRecipe" name="imbRecipe">${IMBUEMENTS.map(i=>`<option value="${i.id}" ${i.id===chosen.id?'selected':''}>${escape(i.name)}</option>`).join('')}</select></label>
 <div class="tool-fields">${materials.map(m=>`<label class="tool-field" for="${priceKey(m.itemId)}"><span class="input-label">${escape(m.name)} · unit price (gp)</span><input type="text" inputmode="decimal" id="${priceKey(m.itemId)}" name="${priceKey(m.itemId)}" value="${escape(inputs[priceKey(m.itemId)]??'')}" placeholder="Unknown"></label>`).join('')}
 <label class="tool-field" for="imbBenefit"><span class="input-label">Estimated benefit per active hour (gp, optional)</span><input type="text" inputmode="decimal" name="imbBenefit" id="imbBenefit" value="${escape(inputs.imbBenefit??'')}" placeholder="Your estimate"></label></div>
 <button class="btn btn-primary" type="submit">Compare costs</button>${quotes.length?'<button class="btn" type="button" id="imbUseMarket">Fill blank prices from fresh Market quotes</button>':''}</form><p id="imbMarketSources" class="helper-text">${escape(inputs.imbMarketSources??'')}</p><p class="helper-text">Use a quote from <a href="#data/market">Market Watch</a> only if its World, observation time and price basis apply to your purchase. Manual inputs take precedence. Fees: Basic 7,500, Intricate 60,000, Powerful 250,000 gp. Materials are cumulative within a recipe; earlier installation fees are not added.</p><div id="imbueResult" aria-live="polite"></div>`);
 const form=container.querySelector('#imbueForm'),result=container.querySelector('#imbueResult');
 const capture=()=>{const values=Object.fromEntries(new FormData(form));Object.assign(inputs,values);onChange(values);return values;};
 const number=(v,label)=>{if(v.trim()==='')return null;if(!/^\d+(?:\.\d+)?$/.test(v.trim())||!Number.isFinite(Number(v)))throw new Error(`${label} must be a nonnegative number.`);return Number(v);};
 const calculate=()=>{try{
  const values=capture();const prices=Object.fromEntries(materials.map(m=>[m.itemId,number(values[priceKey(m.itemId)],m.name)]));
  const benefit=number(values.imbBenefit,'Benefit');const tiers=calculateImbuement(chosen.id,prices);
  result.innerHTML=TIER_ORDER.map(tier=>{
   const calculation=tiers[tier],best=calculation.cheapest;const projection=best?evaluateBreakEven({totalCost:best.total,observedBenefitPerHour:benefit}):null;
   return `<section class="results-section"><h3>${tier[0].toUpperCase()+tier.slice(1)} ${escape(chosen.name)}</h3><p>${escape(chosen.tiers[tier].bonus)} · ${money(TIER_FEES[tier])} shrine fee</p><p class="helper-text">${getCumulativeMaterials(chosen.id,tier).map(m=>`${m.quantity} × ${escape(m.name)}`).join(' + ')}</p>
   <div class="table-container record-table" tabindex="0" role="region" aria-label="${tier} cost options"><table><thead><tr><th>Acquisition</th><th>Purchase list</th><th>Total incl. fee</th><th>Per active hour</th></tr></thead><tbody>${calculation.options.map(o=>`<tr><th scope="row">${o.method==='market'?'Materials':o.method==='tokens'?'Tokens':`Tokens through ${o.hybridFromTier} + materials`}${o===best?' · lowest fully priced option':''}</th><td data-label="Purchase list">${[o.tokenQuantity?`${o.tokenQuantity} × Gold Token`:'',...o.materials.map(m=>`${m.quantity} × ${escape(m.name)}`)].filter(Boolean).join(' + ')}${o.missingItems.length?`<br>Missing: ${o.missingItems.map(escape).join(', ')}`:''}</td><td data-label="Total incl. fee">${money(o.total)}</td><td data-label="Per active hour">${money(o.costPerHour)}</td></tr>`).join('')}</tbody></table></div>
   ${projection&&benefit!==null?`<p>At your estimated ${money(benefit)}/h benefit: ${money(projection.netPerHour)}/h net, ${projection.breakEvenHours===null?'no positive break-even':`${formatNumber(projection.breakEvenHours)} active hours to recover the cost`}. This is a personal estimate, not measured or guaranteed savings.</p>`:''}</section>`;
  }).join('');
 }catch(error){result.textContent=error.message;}};
 form.addEventListener('input',()=>{inputs.imbMarketSources='Prices edited manually.';onChange({imbMarketSources:inputs.imbMarketSources});container.querySelector('#imbMarketSources').textContent=inputs.imbMarketSources;capture();});form.addEventListener('submit',event=>{event.preventDefault();calculate();});
 container.querySelector('#imbUseMarket')?.addEventListener('click',()=>{
  const applied=[];for(const quote of quotes){const input=form.elements.namedItem(priceKey(quote.itemId));if(input.value.trim()===''){input.value=String(quote.price);applied.push(`${quote.name}: ${quote.world}, ${quote.basis}, observed ${quote.observedAt}`);}}
  inputs.imbMarketSources=applied.length?applied.join(' · '):'Existing manual prices preserved; no blank matching fields.';
  onChange({imbMarketSources:inputs.imbMarketSources});container.querySelector('#imbMarketSources').textContent=inputs.imbMarketSources;calculate();
 });
 form.querySelector('#imbRecipe').addEventListener('change',()=>{capture();const nav=container.querySelector('nav').outerHTML;container.innerHTML=nav;renderImbuements(container,{inputs,onChange});});calculate();
}
