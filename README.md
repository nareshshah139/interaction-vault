# interaction-vault

interaction-vault is an MCP server that gives an AI assistant taste for web interactions. It holds an original library of runnable interaction references with the reasoning behind each one, and it can lint your own motion code against the same principles.

## Workflow

1. Describe the project and call `search_references` in diverse mode to get distinct directions.
2. Refine with facet filters from `list_facets`.
3. Pick references and call `get_reference` to read the demo and why it works.
4. Adapt the code to your own tokens and content.
5. Call `review_motion` on the result and fix every error finding.

The `adapt_reference` prompt runs steps 3 to 5 for you.

## Install and build

Node 22 or newer.

```
npm install
npm run build
```

## Claude Code

HTTP, with a bearer token.

```
VAULT_API_TOKENS=<token> node dist/cli.js --http --port 3333
claude mcp add interaction-vault --transport http http://localhost:3333/mcp --header "Authorization: Bearer <token>"
```

stdio.

```
claude mcp add interaction-vault -- node /abs/path/dist/cli.js
```

## Cursor and Claude Desktop

Add this to `mcp.json` for Cursor or `claude_desktop_config.json` for Claude Desktop.

```json
{
  "mcpServers": {
    "interaction-vault": {
      "command": "node",
      "args": ["/abs/path/dist/cli.js"]
    }
  }
}
```

## Configuration

- `VAULT_DIR` is the vault folder. It defaults to `vault` in the package root.
- `VAULT_API_TOKENS` is a comma-separated list of bearer tokens for HTTP. When it is unset, `/mcp` is open and the server warns on stderr.
- `--http` starts the HTTP server. `--port` defaults to 3333 and `--host` defaults to 127.0.0.1.
- `GET /healthz` returns `{ "ok": true, "references": N }` and needs no token.

The HTTP server is stateless. Each POST to `/mcp` gets a new server and transport. GET and DELETE return 405.

## Tools

All tools are read-only and return structured output.

- `list_facets` lists every facet group and value with its reference count.
- `search_references` takes a brief, optional filters, a mode (`diverse` or `best`) and a limit from 1 to 12.
- `get_reference` takes 1 to 4 slugs and returns metadata, why each principle applies, and the html.
- `get_principles` returns principle records, or all of them when no ids are given.
- `review_motion` lints code and returns findings with counts. The checks are heuristics on text, so treat warnings as prompts to think.

Resources are `vault://references/{slug}` (text/html) and `vault://principles` (text/markdown). The prompt is `adapt_reference` with `slugs` and `project`.

## Principles

1. Continuity
2. Motion has a job
3. Quieter when frequent
4. Ease with intent
5. A duration scale
6. Stagger with a lead
7. Respond now, stay interruptible
8. Compositor-only properties
9. One hero per view
10. Respect the setting
11. Reveal through a mask
12. Weight and damping
13. Every input gets the effect

## Add a reference

1. Create `vault/references/<slug>/` with a lowercase hyphenated slug.
2. Write `index.html`. It starts with `<!doctype html>`, is one file with inline style and script, and uses no network. Animate transform, opacity, clip-path or filter only. Include a `prefers-reduced-motion` block and a `:focus-visible` rule for every hover effect.
3. Write `meta.json` with the title, summary, facets, useWhen, techniques, whyItWorks (3 to 5 entries), directions (2 or 3), pitfalls, tunables and reducedMotion. Facet values come from `src/facets.ts` and principle ids from `src/principles.ts`.
4. List each tunable as a CSS custom property in `index.html`. The loader fails if a tunable name does not appear there.
5. Run `npm run check:vault`.

## Check the vault

```
npm run check:vault
```

This loads the vault, runs `review_motion` on every demo, prints the error and warning counts per slug, and exits 1 on any load failure or error-level finding.

## Test

```
npm test
```

The command builds, then runs the node:test suite against a small fixture vault in `test/fixtures/vault`.
