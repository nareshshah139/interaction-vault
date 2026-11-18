import { FACET_GROUPS, FACETS, FAMILY_OF, type Family } from "./facets.js";
import { PRINCIPLE_BY_ID, PRINCIPLES, type PrincipleId } from "./principles.js";
import { countBySeverity, reviewMotion } from "./review.js";
import type { z } from "zod";
import type {
  GetPrinciplesOutput,
  GetReferenceOutput,
  ListFacetsOutput,
  ReviewMotionOutput,
  SearchArgs,
  SearchOutput,
} from "./schemas.js";
import type { Reference, Vault } from "./vault.js";

const familyOf = (r: Reference): Family => FAMILY_OF[r.facets.interaction[0]];

const matchesFilters = (r: Reference, filters: SearchArgs["filters"]): boolean =>
  FACET_GROUPS.every((group) => {
    const wanted: readonly string[] = filters?.[group] ?? [];
    return wanted.length === 0 || r.facets[group].some((v) => wanted.includes(v));
  });

export function pickDiverse<T>(ranked: readonly T[], family: (item: T) => Family, limit: number): T[] {
  const candidates = ranked.slice(0, limit * 3);
  const present = new Set(candidates.map(family));
  const picks: T[] = [];
  const used = new Set<Family>();
  while (picks.length < limit && used.size < present.size) {
    const next = candidates.find((c) => !picks.includes(c) && !used.has(family(c)));
    if (!next) break;
    picks.push(next);
    used.add(family(next));
  }
  for (const c of candidates) if (picks.length < limit && !picks.includes(c)) picks.push(c);
  return picks;
}

const hasFilters = (filters: SearchArgs["filters"]): boolean =>
  FACET_GROUPS.some((group) => (filters?.[group]?.length ?? 0) > 0);

export function searchReferences(vault: Vault, args: SearchArgs): z.output<typeof SearchOutput> {
  const hits = vault
    .rank(args.brief)
    .flatMap(({ slug, score }) => {
      const reference = vault.bySlug.get(slug);
      return reference && matchesFilters(reference, args.filters) ? [{ reference, score }] : [];
    });
  const hitSlugs = new Set(hits.map((h) => h.reference.slug));
  const filterOnly = hasFilters(args.filters)
    ? vault.references
        .filter((r) => !hitSlugs.has(r.slug) && matchesFilters(r, args.filters))
        .map((reference) => ({ reference, score: 0 }))
    : [];
  const ranked = [...hits, ...filterOnly];
  const chosen =
    args.mode === "best" ? ranked.slice(0, args.limit) : pickDiverse(ranked, (x) => familyOf(x.reference), args.limit);
  return {
    results: chosen.map(({ reference, score }) => ({
      slug: reference.slug,
      title: reference.title,
      summary: reference.summary,
      facets: reference.facets,
      principles: reference.whyItWorks.map((w) => w.principle),
      score: Math.round(score * 100) / 100,
    })),
  };
}

export function listFacets(vault: Vault): z.output<typeof ListFacetsOutput> {
  return {
    groups: FACET_GROUPS.map((group) => ({
      group,
      values: FACETS[group].map((id) => ({
        id,
        count: vault.references.filter((r) => (r.facets[group] as readonly string[]).includes(id)).length,
      })),
    })),
  };
}

export type Lookup =
  | { readonly kind: "found"; readonly references: readonly Reference[] }
  | { readonly kind: "missing"; readonly slugs: readonly string[] };

export function lookupReferences(vault: Vault, slugs: readonly string[]): Lookup {
  const found = slugs.map((slug) => vault.bySlug.get(slug));
  const missing = slugs.filter((_, i) => found[i] === undefined);
  if (missing.length > 0) return { kind: "missing", slugs: missing };
  return { kind: "found", references: found.flatMap((r) => (r ? [r] : [])) };
}

export const unknownSlugMessage = (slugs: readonly string[]): string =>
  `Unknown reference slug(s) ${slugs.map((s) => `"${s}"`).join(", ")}. Call search_references to find valid slugs.`;

const principleName = (id: PrincipleId): string => PRINCIPLE_BY_ID.get(id)?.name ?? id;

export function describeReferences(
  references: readonly Reference[],
  includeCode: boolean,
): z.output<typeof GetReferenceOutput> {
  return {
    references: references.map(({ html, whyItWorks, ...rest }) => ({
      ...rest,
      whyItWorks: whyItWorks.map((w) => ({
        principle: w.principle,
        name: principleName(w.principle),
        rule: PRINCIPLE_BY_ID.get(w.principle)?.rule ?? "",
        how: w.how,
      })),
      ...(includeCode ? { html } : {}),
    })),
  };
}

export function getPrinciples(ids: readonly PrincipleId[] | undefined): z.output<typeof GetPrinciplesOutput> {
  const chosen = ids ? ids.flatMap((id) => PRINCIPLE_BY_ID.get(id) ?? []) : PRINCIPLES;
  return {
    principles: chosen.map(({ id, name, rule, why, apply, failure }) => ({ id, name, rule, why, apply, failure })),
  };
}

export function reviewCode(code: string): z.output<typeof ReviewMotionOutput> {
  const findings = reviewMotion(code);
  return { findings, counts: countBySeverity(findings) };
}

export const parseSlugList = (raw: string): string[] =>
  raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

export function adaptPromptText(references: readonly Reference[], project: string): string {
  const slugs = references.map((r) => r.slug);
  const listed = references
    .map(
      (r) =>
        `- ${r.slug}, ${r.title}. Principles to keep are ${r.whyItWorks.map((w) => principleName(w.principle)).join(", ")}.`,
    )
    .join("\n");
  return [
    "Adapt interaction-vault references to my project.",
    `Project\n${project}`,
    `References\n${listed}`,
    [
      "Steps",
      `1. Call get_reference with slugs ${JSON.stringify(slugs)} and read the demo code and whyItWorks.`,
      "2. Keep the interaction idea and the principles listed above.",
      "3. Restyle it to my project's own tokens and content. Do not carry over the demo's placeholder copy or colors.",
      "4. Keep the reduced-motion behavior.",
      "5. Return one file.",
      "6. Call review_motion on that file and fix every error finding. Treat warnings as prompts to think.",
    ].join("\n"),
  ].join("\n\n");
}
