# interaction-vault MCP spec

An MCP server that gives an AI assistant taste for web interactions. It holds an original library of interaction references. Each reference is a runnable demo plus the reasoning that makes it work. A principles registry explains the reasoning and can lint the user's own code.

Workflow the server supports: describe the project, get diverse directions, refine with facets, pick references, read why they work, adapt them, then review the result against the principles.

All content is original. Do not copy code, names or wording from details.so or any other library.

## Layout

```
package.json            "type": "module", bin "interaction-vault" -> dist/cli.js
src/facets.ts           facet registry (the table below)
src/principles.ts       principle registry, each with optional detectors
src/vault.ts            loadVault(dir): parse + index references
src/review.ts           reviewMotion(code): runs every detector
src/server.ts           createServer(vault): McpServer wiring only
src/cli.ts              stdio (default) or --http [--port 3333]
vault/references/<slug>/meta.json
vault/references/<slug>/index.html
test/                   node:test
scripts/check-vault.ts  loads the real vault, runs reviewMotion on every demo, fails on any error-level finding
```

## Facet registry

One `as const` object, group -> list of ids. Zod enums derive from it. Nothing else branches on a facet value.

- interaction: card-hover, cursor-interaction, media-showcase, scroll-animation, horizontal-scroll, parallax, pinned-scroll, stacked-scroll, text-showcase, text-reveal, contextual-transition, page-transition, preloader, section-transition
- section: cta, footer, hero, navigation, drawer, dropdown, fullscreen, morphing, about, features, portfolio, pricing, case-study, testimonial, stats, team, timeline, faq, contact, products, services
- element: 3d, accordion, button, card, carousel, list, modal, rows
- style: brutalist, corporate, editorial, experimental, image-led, luxury, maximalist, minimal, organic, playful, retro
- industry: ai, architecture, art, crypto, education, fashion, finance, food, health, hospitality, industrial, legal, media, music, portfolio, product-design, real-estate, saas, sports, studio, video

Interaction family, used for diversity: pointer = card-hover, cursor-interaction. scroll = media-showcase .. text-reveal. transition = contextual-transition .. section-transition.

## Reference meta.json

The slug is the folder name. `index.html` holds the demo and is not inside meta.json.

```json
{
  "title": "Tilt Glare Card",
  "summary": "One sentence on what the user sees.",
  "facets": {
    "interaction": ["card-hover"],
    "section": ["portfolio"],
    "element": ["card"],
    "style": ["minimal", "luxury"],
    "industry": ["product-design", "portfolio"]
  },
  "useWhen": ["Search-friendly project situations, e.g. 'product grid for a premium hardware brand'"],
  "techniques": ["pointer events", "lerp damping", "CSS custom properties"],
  "whyItWorks": [
    { "principle": "physicality", "how": "How this demo applies that principle, concretely." }
  ],
  "directions": [
    { "name": "Editorial", "change": "What to change to push it this way." }
  ],
  "pitfalls": ["A mistake people make when adapting it."],
  "tunables": [
    { "name": "--tilt-max", "default": "8deg", "effect": "Maximum rotation at the card edge." }
  ],
  "reducedMotion": "What the demo does under prefers-reduced-motion."
}
```

Rules: every facet group key present (empty array allowed except interaction, which needs at least one). `whyItWorks` has 3 to 5 entries, each principle id from the registry below. `directions` has 2 or 3 entries. Every tunable `name` must appear in index.html.

## Demo rules (index.html)

- Starts with `<!doctype html>`. One file. Inline `<style>` and `<script>`. No network: no CDN, no web fonts, no remote images. Use CSS gradients, SVG or canvas for imagery. System font stacks only.
- Tunables are CSS custom properties on `:root` (or JS consts mirrored from them) and match meta.json.
- Animate transform, opacity, clip-path or filter only. Never transition width, height, top, left, right, bottom, margin or padding.
- Never `transition: all`. No `linear` easing except infinite loops or scroll-linked progress.
- Every hover effect has a `:focus-visible` equivalent. Interactive parts are real buttons or links and keyboard operable.
- A `@media (prefers-reduced-motion: reduce)` block that removes movement (fade or instant state change) and matches `reducedMotion` in meta.json.
- Pointer-following motion uses damping in a requestAnimationFrame loop, not raw coordinates.
- No console errors. Works at 1280x800 and 390x844.
- Semantic HTML, a short visible title in the demo is fine, keep chrome minimal so the interaction is the subject.

## Principles registry

Ids and the source text. src/principles.ts stores id, name, rule, why, apply (concrete numbers), failure (what it looks like when violated) and optional detectors.

1. `continuity`. Continuity. Rule: things appear from where they came from and go back there. Why: a spatial link between trigger and result lets people predict the interface. Apply: set transform-origin or clip-path origin to the trigger; use shared-element transitions between views. Failure: panels that pop in from nowhere or slide from an unrelated edge.
2. `purpose`. Motion has a job. Rule: every animation explains a change of state, hierarchy or cause. Why: decorative motion costs attention and reads as noise. Apply: name the change the motion explains before writing it; save decorative flourishes for rare moments such as a first load. Failure: everything bounces and nothing means anything.
3. `frequency`. Quieter when frequent. Rule: the more often an interaction is seen, the faster and subtler it is. Why: delight on the first view becomes friction on the hundredth. Apply: hover and toggle feedback 100 to 200ms, small distances; page-level moments may run longer once per visit. Failure: a 600ms menu that people open fifty times a day.
4. `easing`. Ease with intent. Rule: ease-out for things entering or responding, ease-in for things leaving, ease-in-out for things moving across the screen. Why: linear motion reads as mechanical; the wrong curve feels sluggish. Apply: a strong ease-out such as cubic-bezier(0.22, 1, 0.36, 1) for entrances; linear only for loops and scroll-linked progress. Failure: linear fades, or ease-in on a response so it feels delayed.
5. `timing`. A duration scale. Rule: pick durations from a small scale and make exits faster than entrances. Why: consistent timing reads as one system; quick exits keep the user moving. Apply: micro 120 to 200ms, standard 200 to 400ms, large or page 400 to 800ms; exits about 25 percent shorter. Failure: transitions over a second on routine UI.
6. `choreography`. Stagger with a lead. Rule: offset related elements so the eye follows one path, starting with the most important. Why: everything at once is a flash; a sequence tells the eye where to go. Apply: 30 to 80ms between items, cap total stagger near 400ms. Failure: a list whose last item lands a second after the first.
7. `responsiveness`. Respond now, stay interruptible. Rule: acknowledge input within 100ms and let any animation be reversed mid-flight. Why: motion that blocks input makes the interface feel slow. Apply: use transitions or springs that retarget, never lock input until an animation ends. Failure: a menu that ignores the close click until its open animation finishes.
8. `performance`. Compositor-only properties. Rule: animate transform, opacity and clip-path; avoid layout properties. Why: layout properties force reflow every frame and drop frames on real devices. Apply: translate instead of top/left, scale instead of width/height, will-change only while animating. Failure: janky motion on a mid-range phone.
9. `restraint`. One hero per view. Rule: one focal motion per screen; everything else supports it. Why: competing motion splits attention and cheapens the strong moment. Apply: if two things want to be the hero, make one still. Failure: parallax, a marquee and a cursor trail all on one screen.
10. `reduced-motion`. Respect the setting. Rule: honor prefers-reduced-motion by replacing movement with a fade or an instant change. Why: large motion causes real discomfort for people with vestibular disorders. Apply: keep state changes visible, remove travel, parallax and auto-play. Failure: a reduced-motion user still gets a full-screen wipe.
11. `masking`. Reveal through a mask. Rule: reveal content by moving it inside a clip or mask, not by sliding it across other content. Why: masked reveals feel precise and keep the layout still. Apply: overflow hidden or clip-path on the parent, translate the child by its own height. Failure: text flying in from off-screen across the layout.
12. `physicality`. Weight and damping. Rule: pointer-driven motion follows with damping or springs, not raw coordinates. Why: a small lag gives an object mass and smooths jitter. Apply: lerp factor 0.08 to 0.2 per frame in a requestAnimationFrame loop, or a spring with high damping. Failure: elements that twitch 1:1 with the mouse.
13. `parity`. Every input gets the effect. Rule: anything revealed on hover is also reachable by keyboard focus and touch. Why: hover-only detail excludes keyboard and touch users. Apply: pair :hover with :focus-visible, use @media (hover: hover) for pointer-only flourishes. Failure: a card whose details exist only on mouse hover.

## Detectors (src/review.ts)

Pure function `reviewMotion(code: string): Finding[]` where `Finding = { principle, severity: "error" | "warn", message, line, excerpt }`. Heuristics on text, no browser. Each detector belongs to one principle in the registry. Required detectors:

- performance, error: a transition or animation (shorthand or `transition-property`) naming width, height, top, left, right, bottom, margin*, padding*. Also `@keyframes` blocks that set those properties.
- performance, warn: `transition: all` or `transition-property: all`.
- reduced-motion, error: the code has `transition`, `animation`, `@keyframes`, `.animate(` or `requestAnimationFrame` but no `prefers-reduced-motion`.
- easing, warn: `linear` used in a `transition` declaration, or in an `animation` that is not `infinite`.
- timing, warn: any transition or animation duration over 1000ms (parse ms and s), unless the animation is infinite.
- parity, warn: a `:hover` selector whose base selector has no `:focus-visible` or `:focus-within` rule anywhere in the code.
- physicality, warn: a `pointermove` or `mousemove` listener whose handler body writes `.style.transform` or sets a custom property while the code has no `requestAnimationFrame`.

Return findings sorted by line. Line numbers are 1-based.

## MCP surface

Server name `interaction-vault`. Set server `instructions` describing the workflow: search with the user's brief in diverse mode, refine with facet filters, get_reference for picks, adapt, then review_motion on the adapted code and fix error findings.

Tools (all readOnlyHint true, each with outputSchema, returning structuredContent and a text block with the same JSON):

- `list_facets` {} -> groups, each value with its count of references.
- `search_references` { brief: string, filters?: { interaction?, section?, element?, style?, industry? } (any-of within a group, AND across groups), mode?: "diverse" | "best" (default diverse), limit?: 1..12 (default 6) } -> results: slug, title, summary, facets, principles (ids), score (2 dp). Diverse mode: take the top 3*limit by score, then pick greedily so no two picks share an interaction family until every family present in the candidates is used, then fill by score. Deterministic.
- `get_reference` { slugs: 1..4, include_code?: boolean default true } -> full meta, whyItWorks expanded with each principle's name and rule, and html. Unknown slugs -> isError result naming them and pointing to search_references.
- `get_principles` { ids?: principle id[] } -> full principle records, all when ids omitted.
- `review_motion` { code: string } -> findings plus counts by severity. The description says these are heuristics and to treat warnings as prompts to think.

Resources: template `vault://references/{slug}` (text/html, list callback enumerates all); `vault://principles` (text/markdown, all principles).

Prompt: `adapt_reference` { slugs, project } -> one user message: fetch the references, keep the interaction idea and the principles listed in whyItWorks, restyle to the project's own tokens and content, keep reduced-motion behavior, return one file, then call review_motion and fix errors.

Search: MiniSearch over title (boost 3), useWhen (2), summary, techniques, facet values, principle names. prefix true, fuzzy 0.2, combineWith OR.

## Transports

stdio by default; nothing but protocol on stdout, logs to stderr. `--http`: express, POST /mcp with StreamableHTTPServerTransport stateless (sessionIdGenerator undefined, new server and transport per request, close on response close). GET and DELETE /mcp -> 405 JSON-RPC error. GET /healthz -> { ok: true, references: N }. If VAULT_API_TOKENS (comma-separated) is set, /mcp requires `Authorization: Bearer <token>` else 401 with `WWW-Authenticate: Bearer`. Unset means open, with one warning on stderr. Vault dir from VAULT_DIR, default `<package root>/vault`.

## Reference slugs

Content builder A: tilt-glare-card, blend-cursor, line-mask-reveal, pinned-horizontal-gallery, stacked-cards-scroll, depth-parallax-hero.
Content builder B: shared-element-page-swap, counter-curtain-preloader, expanding-row-detail, origin-morph-drawer, magnetic-pill-button, snap-drag-carousel.
