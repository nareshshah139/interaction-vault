import assert from "node:assert/strict";
import { test } from "node:test";
import { loadVault, VaultLoadError } from "../src/vault.js";
import { FIXTURE, fixtureHtml, fixtureMeta, writeVault } from "./helpers.js";

const GOOD_HTML = fixtureHtml("lift-tile");

test("loads the fixture vault in slug order", () => {
  assert.deepEqual(
    loadVault(FIXTURE).references.map((r) => r.slug),
    ["curtain-intro", "lift-tile", "rise-headline"],
  );
});

test("an empty references folder loads as an empty vault", () => {
  const vault = loadVault(writeVault({}));
  assert.deepEqual(vault.references, []);
  assert.deepEqual(vault.rank("anything"), []);
});

test("a missing references folder fails loudly", () => {
  assert.throws(() => loadVault("/nonexistent-vault-dir"), VaultLoadError);
});

test("an unknown principle id fails with the slug and the zod issue path", () => {
  const meta = fixtureMeta("lift-tile") as { whyItWorks: { principle: string }[] };
  meta.whyItWorks[0]!.principle = "nonsense";
  const dir = writeVault({ "bad-principle": { meta, html: GOOD_HTML } });
  assert.throws(() => loadVault(dir), /bad-principle: whyItWorks\.0\.principle: /);
});

test("a missing field fails with the slug and the field path", () => {
  const { summary: _removed, ...meta } = fixtureMeta("lift-tile");
  const dir = writeVault({ "no-summary": { meta, html: GOOD_HTML } });
  assert.throws(() => loadVault(dir), /no-summary: summary: /);
});

test("too few whyItWorks entries fails at the array path", () => {
  const meta = fixtureMeta("lift-tile") as { whyItWorks: unknown[] };
  meta.whyItWorks = meta.whyItWorks.slice(0, 2);
  const dir = writeVault({ "thin-why": { meta, html: GOOD_HTML } });
  assert.throws(() => loadVault(dir), /thin-why: whyItWorks: /);
});

test("invalid JSON in meta.json fails with the slug", () => {
  const dir = writeVault({ "bad-json": { meta: "{ not json", html: GOOD_HTML } });
  assert.throws(() => loadVault(dir), /bad-json: meta\.json: /);
});

test("a tunable missing from index.html fails with the slug and the name", () => {
  const meta = fixtureMeta("lift-tile") as { tunables: unknown[] };
  meta.tunables.push({ name: "--ghost", default: "1", effect: "Nothing." });
  const dir = writeVault({ "bad-tunable": { meta, html: GOOD_HTML } });
  assert.throws(() => loadVault(dir), /bad-tunable: tunables\.2\.name: "--ghost" does not appear in index\.html/);
});

test("index.html that does not start with the doctype fails", () => {
  const dir = writeVault({ "no-doctype": { meta: fixtureMeta("lift-tile"), html: "<html></html>" } });
  assert.throws(() => loadVault(dir), /no-doctype: index\.html: must start with <!doctype html>/);
});

test("every bad reference is reported in one error", () => {
  const dir = writeVault({
    "bad-one": { meta: "{", html: GOOD_HTML },
    "bad-two": { meta: fixtureMeta("lift-tile"), html: "nope" },
  });
  assert.throws(
    () => loadVault(dir),
    (error) => {
      assert.ok(error instanceof VaultLoadError);
      assert.deepEqual(
        error.problems.map((p) => p.split(":")[0]),
        ["bad-one", "bad-two", "bad-two", "bad-two"],
      );
      return true;
    },
  );
});
