import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { FIXTURE, ROOT } from "./helpers.js";

test("the built stdio entry point serves tools over a real process pipe", async () => {
  const client = new Client({ name: "stdio-test", version: "0.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [join(ROOT, "dist", "cli.js")],
      env: { ...process.env, VAULT_DIR: FIXTURE } as Record<string, string>,
      stderr: "pipe",
    }),
  );
  const result = await client.callTool({ name: "get_principles", arguments: { ids: ["masking"] } });
  const principles = (result.structuredContent as { principles: { name: string }[] }).principles;
  assert.deepEqual(principles.map((p) => p.name), ["Reveal through a mask"]);
  await client.close();
});
