import { parseMarkerBinary, parseMarkerJson, writeMarkerBinary, mergeMarkers } from "../features/minimap-markers.js";
import { escapeAttribute as escape } from "./render-blocks.js";

function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a");
    link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function renderMarkerTool(container) {
    const files = { personal: null, community: null };
    let merged = null;
    const failures = {};
    const pending = new Set();
    const versions = {personal:0,community:0};
    container.insertAdjacentHTML("beforeend", `<p class="helper-text">Choose local .bin or community-format .json marker files. Your personal marker wins at the same x, y and floor. Files stay in this page’s memory until you leave; nothing is uploaded or written into the Tibia folder.</p>
        <div class="tool-fields"><label class="tool-field" for="personalMarkers"><span class="input-label">Personal markers (or file to convert)</span><input type="file" id="personalMarkers" accept=".bin,.json"></label>
        <label class="tool-field" for="communityMarkers"><span class="input-label">Community markers (optional)</span><input type="file" id="communityMarkers" accept=".bin,.json"></label></div>
        <p class="helper-text">Download community JSON from <a href="https://github.com/tibiamaps/tibia-map-data/blob/main/markers.json" target="_blank" rel="noopener noreferrer">TibiaMaps map data</a>. Keep a backup before manually replacing a client file, and close Tibia before replacement.</p>
        <div id="markerResult" role="status" aria-live="polite">Choose a personal file to preview a conversion or merge.</div>
        <div id="markerActions" class="tool-fields" hidden><button class="btn" type="button" data-marker-download="backup">Download original backup</button><button class="btn btn-primary" type="button" data-marker-download="bin">Download minimapmarkers.bin</button><button class="btn" type="button" data-marker-download="json">Download markers.json</button><button class="btn" type="button" data-marker-download="report">Download merge report</button></div><div id="markerConflicts"></div>`);
    const result = container.querySelector("#markerResult");
    const actions = container.querySelector("#markerActions");
    const conflicts = container.querySelector("#markerConflicts");
    const preview = () => {
        actions.hidden = true; conflicts.innerHTML = ""; merged = null;
        if (pending.size || Object.keys(failures).length) { result.textContent = pending.size ? "Reading marker files…" : Object.values(failures).join(" "); return; }
        if (!files.personal) { result.textContent = "Choose a personal file to preview a conversion or merge."; return; }
        merged = mergeMarkers(files.personal.markers, files.community?.markers ?? []);
        // Validate the final binary before offering a download; never discover unsupported data late.
        writeMarkerBinary(merged.markers);
        const s = merged.summary;
        result.textContent = `${s.personalCount} personal + ${s.communityCount} community → ${s.mergedCount} markers. ${s.conflictCount} shared coordinates (${s.identicalConflictCount} identical). ${s.personalDuplicates + s.communityDuplicates} duplicates within input files; last occurrence wins within each input.`;
        actions.hidden = false;
        if (merged.conflicts.length) conflicts.innerHTML = `<h3>Shared coordinates</h3><p class="helper-text">Personal descriptions and icons are kept. Showing the first ${Math.min(50, merged.conflicts.length)}; the report contains all conflicts.</p><div class="table-container record-table" tabindex="0" role="region" aria-label="Marker conflicts"><table><thead><tr><th>Coordinate</th><th>Personal (kept)</th><th>Community</th></tr></thead><tbody>${merged.conflicts.slice(0,50).map(row => `<tr><th scope="row">${row.x}, ${row.y}, ${row.z}</th><td>${escape(row.personal.description)} (${escape(row.personal.icon)})</td><td>${escape(row.community.description)} (${escape(row.community.icon)})</td></tr>`).join("")}</tbody></table></div>`;
    };
    for (const kind of ["personal", "community"]) {
        const input = container.querySelector(`#${kind}Markers`);
        input.addEventListener("change", async () => {
            const file = input.files?.[0];
            const version = ++versions[kind];
            delete failures[kind];
            pending.add(kind);
            files[kind] = null;
            actions.hidden = true;
            try {
                if (file) {
                    if (file.size > 10 * 1024 * 1024) throw new Error("Marker files must be 10 MB or smaller.");
                    const bytes = new Uint8Array(await file.arrayBuffer());
                    if (version !== versions[kind]) return;
                    const markers = /\.bin$/i.test(file.name) ? parseMarkerBinary(bytes, { source: file.name })
                        : /\.json$/i.test(file.name) ? parseMarkerJson(new TextDecoder("utf-8", {fatal:true}).decode(bytes))
                        : (() => { throw new Error("Choose a .bin or .json marker file."); })();
                    writeMarkerBinary(markers);
                    files[kind] = { name: file.name, bytes, markers };
                }
                pending.delete(kind);
                preview();
            } catch (error) { pending.delete(kind); failures[kind] = `${error.message} No files were changed. Choose a valid replacement file.`; preview(); }
        });
    }
    actions.addEventListener("click", event => {
        const kind = event.target.closest("[data-marker-download]")?.dataset.markerDownload;
        if (!kind || !merged) return;
        if (kind === "backup") download(`backup-${files.personal.name}`, files.personal.bytes, "application/octet-stream");
        if (kind === "bin") download("minimapmarkers.bin", writeMarkerBinary(merged.markers), "application/octet-stream");
        if (kind === "json") download("markers.json", JSON.stringify(merged.markers, null, 2), "application/json");
        if (kind === "report") download("marker-merge-report.json", JSON.stringify({generatedAt:new Date().toISOString(), personalFile:files.personal.name, communityFile:files.community?.name ?? null, policy:"Personal wins shared coordinates; last input occurrence wins duplicates.", summary:merged.summary, conflicts:merged.conflicts},null,2), "application/json");
    });
}
