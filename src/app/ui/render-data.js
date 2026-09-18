import {renderPublicData} from "./render-public-data.js";
import { renderDataManagement } from './render-data-management.js';
export const DATA_LABELS={history:'Character History',market:'Market Watch',manage:'Data Management'};
export function renderData(container,options){
 container.className='results-shell';
 container.innerHTML=`<nav class="session-analysis-nav" aria-label="Data">${Object.entries(DATA_LABELS).map(([key,label])=>`<a href="#data/${key}" ${key===options.view?'aria-current="page"':''}>${label}</a>`).join('')}</nav>`;
 if(options.view==="manage")renderDataManagement(container,options);
 else renderPublicData(container,options.view);
}
