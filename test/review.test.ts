import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewMotion } from "../src/review.js";
import { fixtureHtml } from "./helpers.js";

const REDUCED = "@media (prefers-reduced-motion: reduce) { .x { transition: none; } }";

const summary = (code: string) => reviewMotion(code).map((f) => [f.principle, f.severity, f.line]);

test("performance error for a transition on a layout property", () => {
  const code = [".a {", "  transition: width 200ms ease-out;", "}", REDUCED].join("\n");
  assert.deepEqual(summary(code), [["performance", "error", 2]]);
  assert.equal(reviewMotion(code)[0]?.excerpt, "transition: width 200ms ease-out;");
});

test("performance error for transition-property naming margin-left among others", () => {
  const code = [".a {", "  transition-property: opacity, margin-left;", "}", REDUCED].join("\n");
  assert.deepEqual(summary(code), [["performance", "error", 2]]);
});

test("performance error for layout properties inside @keyframes", () => {
  const code = ["@keyframes grow {", "  from { height: 0; }", "  to { height: 100px; }", "}", REDUCED].join("\n");
  assert.deepEqual(summary(code), [
    ["performance", "error", 2],
    ["performance", "error", 3],
  ]);
});

test("performance warn for transition all", () => {
  const code = [".a {", "  transition: all 200ms ease-out;", "}", REDUCED].join("\n");
  assert.deepEqual(summary(code), [["performance", "warn", 2]]);
});

test("reduced-motion error when motion code has no prefers-reduced-motion", () => {
  const code = [".a {", "  color: red;", "  transition: opacity 200ms ease-out;", "}"].join("\n");
  assert.deepEqual(summary(code), [["reduced-motion", "error", 3]]);
});

test("easing warn for linear in a transition and in a finite animation", () => {
  const code = [
    ".a { transition: opacity 200ms linear; }",
    ".b { animation: fade 300ms linear; }",
    ".c { animation: spin 900ms linear infinite; }",
    ".d { background: linear-gradient(red, blue); }",
    REDUCED,
  ].join("\n");
  assert.deepEqual(summary(code), [
    ["easing", "warn", 1],
    ["easing", "warn", 2],
  ]);
});

test("timing warn for a duration over 1000ms in seconds and in milliseconds, not for infinite loops", () => {
  const code = [
    ".a { transition: opacity 1.5s ease-out; }",
    ".b { transition: opacity 1200ms ease-out; }",
    ".c { transition: opacity 1s ease-out; }",
    ".d { animation: spin 3s ease-in-out infinite; }",
    REDUCED,
  ].join("\n");
  assert.deepEqual(summary(code), [
    ["timing", "warn", 1],
    ["timing", "warn", 2],
  ]);
});

test("timing ignores the delay and the commas inside cubic-bezier", () => {
  const code = [".a { transition: opacity 200ms cubic-bezier(0.22, 1, 0.36, 1) 2s; }", REDUCED].join("\n");
  assert.deepEqual(summary(code), []);
});

test("parity warn for :hover without a focus counterpart, none when paired", () => {
  const code = [".card:hover { transform: translateY(-4px); }", ".pair:hover, .pair:focus-visible { opacity: 0.8; }"].join("\n");
  assert.deepEqual(summary(code), [["parity", "warn", 1]]);
});

test("parity accepts :focus-within on the same base selector", () => {
  const code = [".card:hover .title { opacity: 1; }", ".card:focus-within .title { opacity: 1; }"].join("\n");
  assert.deepEqual(summary(code), []);
});

test("physicality warn for an inline pointermove handler that writes transform without rAF", () => {
  const code = [
    'window.addEventListener("pointermove", (e) => {',
    "  card.style.transform = `translate(${e.clientX}px, 0)`;",
    "});",
  ].join("\n");
  assert.deepEqual(summary(code), [["physicality", "warn", 1]]);
});

test("physicality warn for a named mousemove handler that sets a custom property", () => {
  const code = [
    "function onMove(e) {",
    '  el.style.setProperty("--x", e.clientX + "px");',
    "}",
    'el.addEventListener("mousemove", onMove);',
  ].join("\n");
  assert.deepEqual(summary(code), [["physicality", "warn", 4]]);
});

test("physicality is silent when the code has a requestAnimationFrame loop", () => {
  const code = [
    'window.addEventListener("pointermove", (e) => { target = e.clientX; });',
    "function tick() {",
    "  x += (target - x) * 0.12;",
    "  card.style.transform = `translateX(${x}px)`;",
    "  requestAnimationFrame(tick);",
    "}",
    "requestAnimationFrame(tick);",
    REDUCED,
  ].join("\n");
  assert.deepEqual(summary(code), []);
});

test("findings inside comments are ignored", () => {
  const code = ["/* transition: all 3s linear; */", "// .a:hover { color: red; }", ".b { color: blue; }"].join("\n");
  assert.deepEqual(summary(code), []);
});

test("findings come back sorted by line", () => {
  const code = [".a:hover { color: red; }", ".b { transition: all 200ms ease-out; }"].join("\n");
  assert.deepEqual(summary(code), [
    ["parity", "warn", 1],
    ["performance", "warn", 2],
    ["reduced-motion", "error", 2],
  ]);
});

test("a clean snippet yields no findings", () => {
  const code = [
    ":root { --ease: cubic-bezier(0.22, 1, 0.36, 1); }",
    ".card { transition: transform 180ms var(--ease), opacity 180ms var(--ease); }",
    ".card:hover, .card:focus-visible { transform: translateY(-4px); }",
    ".spinner { animation: spin 1s linear infinite; }",
    "@media (prefers-reduced-motion: reduce) {",
    "  .card { transition: opacity 120ms ease-out; }",
    "  .card:hover, .card:focus-visible { transform: none; }",
    "}",
    "let x = 0, target = 0;",
    'window.addEventListener("pointermove", (e) => { target = e.clientX; });',
    "const tick = () => { x += (target - x) * 0.12; el.style.transform = `translateX(${x}px)`; requestAnimationFrame(tick); };",
    "requestAnimationFrame(tick);",
  ].join("\n");
  assert.deepEqual(reviewMotion(code), []);
});

test("every fixture demo is clean", () => {
  for (const slug of ["lift-tile", "rise-headline", "curtain-intro"])
    assert.deepEqual(reviewMotion(fixtureHtml(slug)), [], slug);
});
