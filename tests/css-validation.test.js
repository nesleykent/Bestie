import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCss } from "../scripts/check-css.mjs";

const check = css => checkCss([["test.css", css]]);
test("CSS ownership permits responsive variants and quoted SVG braces", () => {
    check(':root { --ink: #111; } .button { color: var(--ink); background: url("data:image/svg+xml,{test}"); } @media (max-width: 900px) { .button { padding: 4px; } }');
});
test("CSS ownership rejects duplicate rules, properties and missing tokens", () => {
    assert.throws(() => check('.button { color: red; } .button { color: blue; }'), /duplicate rule/);
    assert.throws(() => check('.button { color: red; color: blue; }'), /duplicate property/);
    assert.throws(() => check('.button { color: var(--missing); }'), /Undefined CSS token/);
    assert.throws(() => check('.button { color: red;'), /unclosed rule/);
});
