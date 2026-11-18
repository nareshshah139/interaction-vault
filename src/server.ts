import { createRequire } from "node:module";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  adaptPromptText,
  describeReferences,
  getPrinciples,
  listFacets,
  lookupReferences,
  parseSlugList,
  reviewCode,
  searchReferences,
  unknownSlugMessage,
} from "./queries.js";
import { principlesMarkdown } from "./principles.js";
import {
  AdaptPromptArgs,
  GetPrinciplesInput,
  GetPrinciplesOutput,
  GetReferenceInput,
  GetReferenceOutput,
  ListFacetsInput,
  ListFacetsOutput,
  ReviewMotionInput,
  ReviewMotionOutput,
  SearchInput,
  SearchOutput,
} from "./schemas.js";
import type { Vault } from "./vault.js";

const pkg: { version: string } = createRequire(import.meta.url)("../package.json");

const INSTRUCTIONS = [
  "interaction-vault gives you taste for web interactions. It holds original, runnable references and the principles behind them.",
  "Workflow. Call search_references with the user's brief in diverse mode to get distinct directions.",
  "Refine with facet filters from list_facets. Call get_reference on the picks and read whyItWorks.",
  "Adapt the code to the project's own tokens and content, keeping the principles.",
  "Then call review_motion on the adapted code and fix every error finding. Treat warnings as prompts to think.",
].join(" ");

const READ_ONLY = { readOnlyHint: true } as const;

const ok = (value: Record<string, unknown>): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
  structuredContent: value,
});

const fail = (text: string): CallToolResult => ({ isError: true, content: [{ type: "text", text }] });

export function createServer(vault: Vault): McpServer {
  const server = new McpServer({ name: "interaction-vault", version: pkg.version }, { instructions: INSTRUCTIONS });

  server.registerTool(
    "list_facets",
    {
      title: "List facets",
      description: "List every facet group and value with the number of references that carry it. Use it to pick filters for search_references.",
      inputSchema: ListFacetsInput,
      outputSchema: ListFacetsOutput,
      annotations: READ_ONLY,
    },
    () => ok(listFacets(vault)),
  );

  server.registerTool(
    "search_references",
    {
      title: "Search references",
      description:
        "Search the interaction library with a project brief. Diverse mode returns distinct interaction families first. Returns slugs, summaries, facets and principle ids. Call get_reference for the code.",
      inputSchema: SearchInput,
      outputSchema: SearchOutput,
      annotations: READ_ONLY,
    },
    (args) => ok(searchReferences(vault, args)),
  );

  server.registerTool(
    "get_reference",
    {
      title: "Get reference",
      description:
        "Fetch 1 to 4 references by slug. Returns the full metadata, why each principle applies with its rule, the tunables, and the demo html.",
      inputSchema: GetReferenceInput,
      outputSchema: GetReferenceOutput,
      annotations: READ_ONLY,
    },
    ({ slugs, include_code }) => {
      const found = lookupReferences(vault, slugs);
      return found.kind === "missing" ? fail(unknownSlugMessage(found.slugs)) : ok(describeReferences(found.references, include_code));
    },
  );

  server.registerTool(
    "get_principles",
    {
      title: "Get principles",
      description: "Return motion principle records with rule, why, apply and failure. Omit ids to get all of them.",
      inputSchema: GetPrinciplesInput,
      outputSchema: GetPrinciplesOutput,
      annotations: READ_ONLY,
    },
    ({ ids }) => ok(getPrinciples(ids)),
  );

  server.registerTool(
    "review_motion",
    {
      title: "Review motion code",
      description:
        "Lint HTML, CSS or JS against the motion principles. These checks are heuristics on text, not a browser run. Fix error findings. Treat warnings as prompts to think, not as verdicts.",
      inputSchema: ReviewMotionInput,
      outputSchema: ReviewMotionOutput,
      annotations: READ_ONLY,
    },
    ({ code }) => ok(reviewCode(code)),
  );

  server.registerResource(
    "reference",
    new ResourceTemplate("vault://references/{slug}", {
      list: () => ({
        resources: vault.references.map((r) => ({
          uri: `vault://references/${r.slug}`,
          name: r.slug,
          title: r.title,
          description: r.summary,
          mimeType: "text/html",
        })),
      }),
    }),
    { title: "Reference demo", description: "The runnable index.html of one reference.", mimeType: "text/html" },
    (uri, { slug }) => {
      const requested = Array.isArray(slug) ? slug.join(",") : (slug ?? "");
      const found = lookupReferences(vault, [requested]);
      if (found.kind === "missing") throw new McpError(ErrorCode.InvalidParams, unknownSlugMessage(found.slugs));
      return { contents: found.references.map((r) => ({ uri: uri.href, mimeType: "text/html", text: r.html })) };
    },
  );

  server.registerResource(
    "principles",
    "vault://principles",
    { title: "Motion principles", description: "All motion principles as markdown.", mimeType: "text/markdown" },
    (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: principlesMarkdown() }] }),
  );

  server.registerPrompt(
    "adapt_reference",
    {
      title: "Adapt references",
      description: "Adapt one or more references to a project while keeping the principles that make them work.",
      argsSchema: AdaptPromptArgs,
    },
    ({ slugs, project }) => {
      const found = lookupReferences(vault, parseSlugList(slugs));
      if (found.kind === "missing") throw new McpError(ErrorCode.InvalidParams, unknownSlugMessage(found.slugs));
      return {
        messages: [{ role: "user", content: { type: "text", text: adaptPromptText(found.references, project) } }],
      };
    },
  );

  return server;
}
