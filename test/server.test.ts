import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import {
  GetPrinciplesOutput,
  GetReferenceOutput,
  ListFacetsOutput,
  ReviewMotionOutput,
  SearchOutput,
} from "../src/schemas.js";
import { loadVault } from "../src/vault.js";
import { connect, FIXTURE, fixtureHtml, fixtureMeta, textOf, writeVault } from "./helpers.js";

const vault = loadVault(FIXTURE);

async function call<S extends z.ZodType>(
  name: string,
  args: Record<string, unknown>,
  schema: S,
  target = vault,
): Promise<z.output<S>> {
  const client = await connect(target);
  const result = await client.callTool({ name, arguments: args });
  assert.notEqual(result.isError, true, JSON.stringify(result.content));
  return schema.parse(result.structuredContent);
}

const slugsOf = async (args: Record<string, unknown>, target = vault) =>
  (await call("search_references", args, SearchOutput, target)).results.map((r) => r.slug);

test("listTools returns exactly the five tools, all read-only with an output schema", async () => {
  const { tools } = await (await connect(vault)).listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), [
    "get_principles",
    "get_reference",
    "list_facets",
    "review_motion",
    "search_references",
  ]);
  for (const tool of tools) {
    assert.equal(tool.annotations?.readOnlyHint, true, tool.name);
    assert.equal(tool.outputSchema?.type, "object", tool.name);
  }
});

test("the search input schema reaches the client as JSON schema with defaults and bounds", async () => {
  const { tools } = await (await connect(vault)).listTools();
  const search = tools.find((t) => t.name === "search_references");
  const properties = search?.inputSchema.properties as Record<string, Record<string, unknown>>;
  assert.deepEqual(search?.inputSchema.required, ["brief"]);
  assert.equal(properties["limit"]?.["maximum"], 12);
  assert.equal(properties["mode"]?.["default"], "diverse");
});

test("server instructions describe the workflow", async () => {
  const instructions = (await connect(vault)).getInstructions();
  assert.match(instructions ?? "", /search_references .* diverse mode/);
  assert.match(instructions ?? "", /review_motion/);
});

test("a hardware product brief ranks lift-tile first", async () => {
  assert.equal((await slugsOf({ brief: "product grid for a premium hardware brand" }))[0], "lift-tile");
});

test("an editorial scroll brief ranks rise-headline first", async () => {
  assert.equal((await slugsOf({ brief: "editorial article headline that reveals as the reader scrolls" }))[0], "rise-headline");
});

test("a restaurant intro brief ranks curtain-intro first and scores round to 2 decimals", async () => {
  const { results } = await call("search_references", { brief: "loading screen for a restaurant site" }, SearchOutput);
  assert.equal(results[0]?.slug, "curtain-intro");
  assert.equal(results[0]?.score, Math.round((results[0]?.score ?? 0) * 100) / 100);
  assert.deepEqual(results[0]?.principles, ["masking", "timing", "reduced-motion"]);
});

test("filters narrow within a group with any-of and across groups with AND", async () => {
  const brief = "minimal";
  assert.deepEqual((await slugsOf({ brief })).sort(), ["lift-tile", "rise-headline"]);
  assert.deepEqual(await slugsOf({ brief, filters: { interaction: ["text-reveal"] } }), ["rise-headline"]);
  assert.deepEqual(await slugsOf({ brief, filters: { style: ["luxury"] } }), ["lift-tile"]);
  assert.deepEqual((await slugsOf({ brief, filters: { industry: ["media", "product-design"] } })).sort(), ["lift-tile", "rise-headline"]);
  assert.deepEqual(await slugsOf({ brief, filters: { style: ["minimal"], industry: ["media"] } }), ["rise-headline"]);
  assert.deepEqual(await slugsOf({ brief, filters: { style: ["luxury"], industry: ["media"] } }), []);
});

test("filter matches the brief missed still come back, after the text hits, with score 0", async () => {
  const { results } = await call(
    "search_references",
    { brief: "minimal", filters: { interaction: ["preloader", "card-hover"] } },
    SearchOutput,
  );
  assert.deepEqual(results.map((r) => [r.slug, r.score > 0]), [["lift-tile", true], ["curtain-intro", false]]);
});

test("an invalid facet value is rejected as a tool error", async () => {
  const client = await connect(vault);
  const result = await client.callTool({ name: "search_references", arguments: { brief: "x", filters: { style: ["gothic"] } } });
  assert.equal(result.isError, true);
});

test("diverse mode returns distinct interaction families first, best mode does not", async () => {
  const twin = { meta: { ...fixtureMeta("lift-tile"), title: "Lift Tile Twin" }, html: fixtureHtml("lift-tile") };
  const crowded = loadVault(writeVault({ "lift-tile-twin": twin }, { withFixture: true }));
  const brief = "lift tile headline curtain";
  assert.deepEqual(await slugsOf({ brief, limit: 3, mode: "best" }, crowded), ["lift-tile", "lift-tile-twin", "rise-headline"]);
  assert.deepEqual(await slugsOf({ brief, limit: 3 }, crowded), ["lift-tile", "rise-headline", "curtain-intro"]);
  assert.deepEqual(await slugsOf({ brief, limit: 4 }, crowded), ["lift-tile", "rise-headline", "curtain-intro", "lift-tile-twin"]);
});

test("limit caps the result count", async () => {
  assert.equal((await slugsOf({ brief: "minimal tile headline curtain", limit: 1 })).length, 1);
});

test("list_facets counts references per value", async () => {
  const { groups } = await call("list_facets", {}, ListFacetsOutput);
  assert.deepEqual(groups.map((g) => g.group), ["interaction", "section", "element", "style", "industry"]);
  const style = groups.find((g) => g.group === "style")?.values;
  assert.deepEqual(style?.find((v) => v.id === "minimal"), { id: "minimal", count: 2 });
  assert.deepEqual(style?.find((v) => v.id === "brutalist"), { id: "brutalist", count: 0 });
});

test("get_reference returns html and whyItWorks entries with the principle name and rule", async () => {
  const { references } = await call("get_reference", { slugs: ["lift-tile"] }, GetReferenceOutput);
  const ref = references[0];
  assert.ok(ref?.html?.startsWith("<!doctype html>"));
  assert.deepEqual(ref?.whyItWorks[0], {
    principle: "frequency",
    name: "Quieter when frequent",
    rule: "The more often an interaction is seen, the faster and subtler it is.",
    how: "The tile moves 6px in 180ms, small enough to see fifty times a session.",
  });
  assert.equal(ref?.tunables[0]?.name, "--lift");
});

test("get_reference with include_code false omits html and keeps request order for several slugs", async () => {
  const { references } = await call("get_reference", { slugs: ["rise-headline", "lift-tile"], include_code: false }, GetReferenceOutput);
  assert.deepEqual(references.map((r) => r.slug), ["rise-headline", "lift-tile"]);
  assert.equal(references.some((r) => "html" in r), false);
});

test("get_reference with an unknown slug is an error that names it", async () => {
  const client = await connect(vault);
  const result = await client.callTool({ name: "get_reference", arguments: { slugs: ["lift-tile", "no-such-slug"] } });
  assert.equal(result.isError, true);
  const text = (result.content as { type: string; text: string }[])[0]?.text;
  assert.match(text ?? "", /"no-such-slug"/);
  assert.match(text ?? "", /search_references/);
});

test("get_reference rejects more than four slugs", async () => {
  const client = await connect(vault);
  const result = await client.callTool({ name: "get_reference", arguments: { slugs: ["a", "b", "c", "d", "e"] } });
  assert.equal(result.isError, true);
});

test("get_principles with no ids returns all 13 in registry order", async () => {
  const { principles } = await call("get_principles", {}, GetPrinciplesOutput);
  assert.equal(principles.length, 13);
  assert.equal(principles[0]?.id, "continuity");
  assert.equal(principles[12]?.id, "parity");
});

test("get_principles with ids returns those records in the order asked", async () => {
  const { principles } = await call("get_principles", { ids: ["parity", "easing"] }, GetPrinciplesOutput);
  assert.deepEqual(principles.map((p) => p.id), ["parity", "easing"]);
  assert.equal(principles[1]?.failure, "Linear fades, or ease-in on a response so it feels delayed.");
});

test("review_motion returns findings and counts by severity", async () => {
  const out = await call("review_motion", { code: ".a:hover { color: red; }\n.b { transition: all 2s linear; }" }, ReviewMotionOutput);
  assert.deepEqual(out.counts, { error: 1, warn: 4 });
  assert.deepEqual(out.findings.map((f) => [f.principle, f.line]), [
    ["parity", 1],
    ["easing", 2],
    ["timing", 2],
    ["performance", 2],
    ["reduced-motion", 2],
  ]);
});

test("readResource on a reference uri returns text/html", async () => {
  const client = await connect(vault);
  const { contents } = await client.readResource({ uri: "vault://references/lift-tile" });
  assert.equal(contents[0]?.mimeType, "text/html");
  assert.equal(textOf(contents[0]), fixtureHtml("lift-tile"));
});

test("readResource on an unknown reference is an error", async () => {
  const client = await connect(vault);
  await assert.rejects(client.readResource({ uri: "vault://references/missing" }), /missing/);
});

test("listResources enumerates every reference and the principles resource", async () => {
  const client = await connect(vault);
  const { resources } = await client.listResources();
  assert.deepEqual(resources.map((r) => r.uri).sort(), [
    "vault://principles",
    "vault://references/curtain-intro",
    "vault://references/lift-tile",
    "vault://references/rise-headline",
  ]);
});

test("the principles resource is markdown with every principle name", async () => {
  const client = await connect(vault);
  const { contents } = await client.readResource({ uri: "vault://principles" });
  assert.equal(contents[0]?.mimeType, "text/markdown");
  assert.match(textOf(contents[0]), /^# Motion principles\n\n## Continuity \(continuity\)/);
  assert.match(textOf(contents[0]), /## Every input gets the effect \(parity\)/);
});

test("adapt_reference builds one user message that names the project and the principles", async () => {
  const client = await connect(vault);
  const prompt = await client.getPrompt({ name: "adapt_reference", arguments: { slugs: "lift-tile, rise-headline", project: "a watch store" } });
  assert.equal(prompt.messages.length, 1);
  const message = prompt.messages[0];
  assert.equal(message?.role, "user");
  const text = message?.content.type === "text" ? message.content.text : "";
  assert.match(text, /a watch store/);
  assert.match(text, /get_reference with slugs \["lift-tile","rise-headline"\]/);
  assert.match(text, /lift-tile, Lift Tile\. Principles to keep are Quieter when frequent, Ease with intent, Every input gets the effect\./);
  assert.match(text, /review_motion/);
});

test("adapt_reference with an unknown slug is rejected", async () => {
  const client = await connect(vault);
  await assert.rejects(client.getPrompt({ name: "adapt_reference", arguments: { slugs: "ghost", project: "x" } }), /"ghost"/);
});
