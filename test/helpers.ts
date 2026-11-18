import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import type { Vault } from "../src/vault.js";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const FIXTURE = join(ROOT, "test", "fixtures", "vault");

export async function connect(vault: Vault): Promise<Client> {
  const client = new Client({ name: "test", version: "0.0.0" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([createServer(vault).connect(serverSide), client.connect(clientSide)]);
  return client;
}

export const fixtureMeta = (slug: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(FIXTURE, "references", slug, "meta.json"), "utf8"));

export const fixtureHtml = (slug: string): string =>
  readFileSync(join(FIXTURE, "references", slug, "index.html"), "utf8");

export type RefFiles = { readonly meta: unknown; readonly html: string };

export function writeVault(refs: Record<string, RefFiles>, { withFixture = false } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "vault-test-"));
  mkdirSync(join(dir, "references"), { recursive: true });
  if (withFixture) cpSync(join(FIXTURE, "references"), join(dir, "references"), { recursive: true });
  for (const [slug, files] of Object.entries(refs)) {
    mkdirSync(join(dir, "references", slug), { recursive: true });
    writeFileSync(
      join(dir, "references", slug, "meta.json"),
      typeof files.meta === "string" ? files.meta : JSON.stringify(files.meta),
    );
    writeFileSync(join(dir, "references", slug, "index.html"), files.html);
  }
  return dir;
}

export const textOf = (content: { text: string } | { blob: string } | undefined): string =>
  content && "text" in content ? content.text : "";
