import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import assert from "node:assert/strict";
import { checkCss } from "./check-css.mjs";
export async function filesIn(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    return (await Promise.all(entries.map((entry) => entry.isDirectory() ? filesIn(`${dir}/${entry.name}`) : `${dir}/${entry.name}`))).flat();
}
const source = await filesIn("src");
checkCss(await Promise.all(source.filter(file => file.endsWith(".css")).map(async file => [file, await readFile(file, "utf8")])));
for (const file of [...source, ...await filesIn("tests"), ...await filesIn("scripts")]) {
    const text = await readFile(file, "utf8");
    if (/\.m?js$/.test(file)) {
        const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
        assert.equal(check.status, 0, check.stderr);
        for (const match of text.matchAll(/(?:from\s+|import\s*)["'](\.[^"']+)["']/g)) {
            await readFile(resolve(dirname(file), match[1]));
        }
    }
    if (file.endsWith(".json")) JSON.parse(text);
}
const html = await readFile("src/index.html", "utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, "Duplicate HTML IDs");
for (const match of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)) await readFile(resolve("src", match[1]));
console.log("Static lint passed: JavaScript syntax, module paths, JSON, HTML IDs, CSS ownership/tokens and local assets.");
