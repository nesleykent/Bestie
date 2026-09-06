// GitHub Pages serves these files unchanged. Stage the same deployable entry points.
import "./check-static.mjs";
import { cp, mkdir } from "node:fs/promises";
await mkdir("dist", { recursive: true });
await cp("src", "dist/src", { recursive: true });
await cp("index.html", "dist/index.html");
console.log("Static build staged in dist/ (no bundling or transpilation required).");
