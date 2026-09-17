/** Reproducible import from an inspected, local MIT TibiaPal checkout. */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const root = process.argv[2];
if (!root) throw new Error("Usage: node scripts/import-hunt-grounds.mjs /path/to/TibiaPal");
const revision = execFileSync("git",["-C",root,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
const read = async path => JSON.parse((await readFile(resolve(root,path),"utf8")).replace(/^\uFEFF/,""));
const grounds = [];
const ids = new Set();
const files = ["soloknight","solopaladin","solomonk","solosorcerer","solodruid","teamhunt"];
for (const file of files) {
    const sourceFile = `_data/hunting/${file}.json`;
    const rows = await read(sourceFile);
    for (const row of rows) {
        const vocation = file === "teamhunt" ? null : file.replace("solo","");
        const context = row.weapon_type ?? row.runes ?? row.mastery ?? row.playstyle ?? "";
        const key = `${file}|${row.place}|${row.level}|${context}`;
        const id = `${vocation ?? "team"}-${createHash("sha256").update(key).digest("hex").slice(0,12)}`;
        if (ids.has(id)) throw new Error(`Duplicate source identity: ${key}`);
        ids.add(id);
        grounds.push({id,place:row.place,minLevel:row.level,vocation,partySize:vocation ? "solo" : "team",context,
            referenceRawExperiencePerHour:row.raw_exp,referenceProfitPerHour:row.loot,
            referenceVideoUrl:/^https:\/\/youtu\.be\/[\w-]+(?:\?.*)?$/.test(row.link ?? "") ? row.link : null,sourceFile});
    }
}
await writeFile("src/data/hunt-grounds.json",JSON.stringify({schemaVersion:1,source:{repository:"https://github.com/PawelKusnierek/TibiaPal",revision,license:"MIT",notice:"third-party/TibiaPal-LICENSE.txt",files:files.map(file=>`_data/hunting/${file}.json`),note:"Full current hunting dataset at this revision; legacy hunting_old tables excluded. Rates and advice are reference observations, not guarantees. Missing prices/rates remain unknown. Source table labels loot; source page describes these values as market-based profit on established worlds."},grounds},null,2)+"\n");
console.log(`Imported ${grounds.length} source rows from ${revision}.`);
