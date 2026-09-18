import { dataScopes } from '../state/data-management.js';
import { escapeAttribute as escape } from './render-blocks.js';
export function renderDataManagement(container,{workspace,characterLabel,onExport,onImport,onClear,onClearAll}) {
 container.insertAdjacentHTML('beforeend',`<p>Local data belongs to <strong>${escape(characterLabel)}</strong>. Public Character History and Market snapshots are maintained in the repository and are separate from this browser.</p>
 <div class="button-group"><button class="btn" id="manageExport">Export all characters</button><button class="btn" id="manageImport">Restore a backup</button><a href="#trackers/changes">Recent changes / undo</a></div>
 <p class="helper-text">Restores accept legacy single-character and current multi-character backups. A recovery backup downloads before any replacement or clear. Original legacy browser saves are retained during migration.</p>
 <form id="manageClearForm"><fieldset><legend>Clear selected data for ${escape(characterLabel)}</legend>${dataScopes(workspace).map(scope=>`<label class="tool-field"><span><input type="checkbox" name="scope" value="${escape(scope.id)}"> ${escape(scope.label)} · ${scope.count} ${scope.unit}</span></label>`).join('')}</fieldset><p id="managePreview" role="status">Select the data to clear. Other characters are unaffected.</p><button type="submit" class="btn" id="manageClear" disabled>Review selected clear</button></form>
 <details><summary>Clear every character and all local data</summary><p>This also removes local preferences and saved legacy workspaces. Export a backup first or use the automatic recovery download.</p><button type="button" class="btn" id="manageClearAll">Clear all local data</button></details>`);
 const form=container.querySelector('#manageClearForm');
 const selected=()=>[...new FormData(form).getAll('scope')];
 form.addEventListener('change',()=>{const scopes=selected();container.querySelector('#manageClear').disabled=!scopes.length;container.querySelector('#managePreview').textContent=scopes.length?`${scopes.length} scopes selected. A confirmation lists the affected records before clearing.`:'Select the data to clear. Other characters are unaffected.';});
 form.addEventListener('submit',e=>{e.preventDefault();onClear(selected());});
 container.querySelector('#manageExport').addEventListener('click',onExport);
 container.querySelector('#manageImport').addEventListener('click',onImport);
 container.querySelector('#manageClearAll').addEventListener('click',onClearAll);
}
