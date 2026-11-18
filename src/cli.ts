#!/usr/bin/env node
import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createHttpApp, startHttp, tokensFromEnv } from "./http.js";
import { createServer } from "./server.js";
import { loadVault } from "./vault.js";

const { values } = parseArgs({
  options: {
    http: { type: "boolean", default: false },
    port: { type: "string", default: "3333" },
    host: { type: "string", default: "127.0.0.1" },
  },
});

const port = Number(values.port);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  process.stderr.write(`interaction-vault: invalid --port ${values.port}\n`);
  process.exit(2);
}

try {
  const vault = loadVault(process.env["VAULT_DIR"] ?? undefined);
  if (values.http) {
    await startHttp(createHttpApp(vault, tokensFromEnv(process.env), values.host), port, values.host);
    process.stderr.write(`interaction-vault: ${vault.references.length} references on http://${values.host}:${port}/mcp\n`);
  } else {
    await createServer(vault).connect(new StdioServerTransport());
    process.stderr.write(`interaction-vault: ${vault.references.length} references over stdio\n`);
  }
} catch (error) {
  process.stderr.write(`interaction-vault: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
