import assert from "node:assert/strict";

// Bestie uses flat component rules inside media queries. Check their ownership
// without confusing strings (including SVG data URLs) with CSS structure.
export function checkCss(files) {
    const definitions = new Set();
    const references = new Set();
    for (const [file, source] of files) {
        const css = source.replace(/\/\*[\s\S]*?\*\//g, "");
        for (const match of css.matchAll(/(--[\w-]+)\s*:/g)) definitions.add(match[1]);
        for (const match of css.matchAll(/var\(\s*(--[\w-]+)/g)) references.add(match[1]);
        const stack = [{ start: 0, selectors: new Set() }];
        let quote = "";
        for (let i = 0; i < css.length; i++) {
            const char = css[i];
            if (quote) {
                if (char === "\\") i++;
                else if (char === quote) quote = "";
                continue;
            }
            if (char === '"' || char === "'") { quote = char; continue; }
            const parent = stack.at(-1);
            if (char === "{") {
                const selector = css.slice(parent.start, i).trim().replace(/\s+/g, " ");
                assert(selector && !selector.endsWith(","), `${file}: incomplete selector`);
                assert(!parent.selectors.has(selector), `${file}: duplicate rule ${selector}`);
                parent.selectors.add(selector);
                stack.push({ start: i + 1, selectors: new Set(), selector });
            } else if (char === "}") {
                assert(stack.length > 1, `${file}: unmatched closing brace`);
                const rule = stack.pop();
                if (!rule.selectors.size) {
                    const properties = [...css.slice(rule.start, i).matchAll(/(?:^|;)\s*([\w-]+)\s*:/g)].map(m => m[1]);
                    assert.equal(new Set(properties).size, properties.length, `${file}: duplicate property in ${rule.selector}`);
                }
                stack.at(-1).start = i + 1;
            }
        }
        assert.equal(stack.length, 1, `${file}: unclosed rule`);
        assert.equal(quote, "", `${file}: unclosed string`);
    }
    for (const name of references) assert(definitions.has(name), `Undefined CSS token: ${name}`);
}
