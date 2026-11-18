import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createHttpApp, startHttp, tokensFromEnv } from "../src/http.js";
import { loadVault } from "../src/vault.js";
import { z } from "zod";
import { FIXTURE } from "./helpers.js";

const RpcError = z.object({ error: z.object({ code: z.number(), message: z.string() }) });

let secured: Server;
let securedUrl: string;
let open: Server;
let openUrl: string;

const urlOf = (server: Server) => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

before(async () => {
  const vault = loadVault(FIXTURE);
  secured = await startHttp(createHttpApp(vault, tokensFromEnv({ VAULT_API_TOKENS: "t1, t2" })), 0, "127.0.0.1");
  securedUrl = urlOf(secured);
  open = await startHttp(createHttpApp(vault, tokensFromEnv({})), 0, "127.0.0.1");
  openUrl = urlOf(open);
});

after(() => {
  secured.close();
  open.close();
});

const initialize = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "raw", version: "0" } },
};

const post = (url: string, headers: Record<string, string>) =>
  fetch(`${url}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify(initialize),
  });

test("tokensFromEnv splits, trims and drops empties", () => {
  assert.deepEqual(tokensFromEnv({ VAULT_API_TOKENS: " a, b ,,c " }), ["a", "b", "c"]);
  assert.deepEqual(tokensFromEnv({}), []);
});

test("a request without a token gets 401 with WWW-Authenticate", async () => {
  const res = await post(securedUrl, {});
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("www-authenticate"), "Bearer");
  assert.equal(RpcError.parse(await res.json()).error.message, "Unauthorized");
});

test("a wrong token gets 401", async () => {
  assert.equal((await post(securedUrl, { authorization: "Bearer nope" })).status, 401);
});

test("a client with the bearer header lists the five tools", async () => {
  const client = new Client({ name: "http-test", version: "0.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${securedUrl}/mcp`), {
      requestInit: { headers: { Authorization: "Bearer t2" } },
    }),
  );
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), [
    "get_principles",
    "get_reference",
    "list_facets",
    "review_motion",
    "search_references",
  ]);
  const result = await client.callTool({ name: "search_references", arguments: { brief: "loading screen for a restaurant site" } });
  const first = (result.structuredContent as { results: { slug: string }[] }).results[0];
  assert.equal(first?.slug, "curtain-intro");
  await client.close();
});

test("with no tokens configured the endpoint is open", async () => {
  assert.equal((await post(openUrl, {})).status, 200);
});

test("GET and DELETE on /mcp are 405 JSON-RPC errors", async () => {
  for (const method of ["GET", "DELETE"]) {
    const res = await fetch(`${securedUrl}/mcp`, { method, headers: { authorization: "Bearer t1" } });
    assert.equal(res.status, 405, method);
    assert.equal(RpcError.parse(await res.json()).error.code, -32000, method);
  }
});

test("GET /healthz reports the reference count without a token", async () => {
  const res = await fetch(`${securedUrl}/healthz`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, references: 3 });
});

test("a malformed JSON body is a client error, not a crash", async () => {
  const res = await fetch(`${openUrl}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
  assert.equal(res.status, 400);
});
