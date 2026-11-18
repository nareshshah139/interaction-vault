import { z } from "zod";
import { FacetFilterSchema, FacetsSchema } from "./facets.js";
import { SEVERITIES } from "./detectors.js";
import { PrincipleIdSchema } from "./principles.js";
import { MetaSchema } from "./vault.js";

export const ListFacetsInput = z.object({});
export const ListFacetsOutput = z.object({
  groups: z.array(
    z.object({
      group: z.string(),
      values: z.array(z.object({ id: z.string(), count: z.number().int() })),
    }),
  ),
});

export const SearchInput = z.object({
  brief: z.string().min(1).describe("The project or situation in the user's own words."),
  filters: FacetFilterSchema.optional().describe(
    "Facet filters. Values within a group match any of them. Groups combine with AND.",
  ),
  mode: z
    .enum(["diverse", "best"])
    .default("diverse")
    .describe("diverse spreads results across interaction families. best returns the top scores."),
  limit: z.number().int().min(1).max(12).default(6),
});
export type SearchArgs = z.output<typeof SearchInput>;

export const SearchOutput = z.object({
  results: z.array(
    z.object({
      slug: z.string(),
      title: z.string(),
      summary: z.string(),
      facets: FacetsSchema,
      principles: z.array(PrincipleIdSchema),
      score: z.number(),
    }),
  ),
});

export const GetReferenceInput = z.object({
  slugs: z.array(z.string()).min(1).max(4),
  include_code: z.boolean().default(true).describe("Include the full index.html. Default true."),
});

const PrincipleOut = z.object({
  id: PrincipleIdSchema,
  name: z.string(),
  rule: z.string(),
  why: z.string(),
  apply: z.string(),
  failure: z.string(),
});

export const GetReferenceOutput = z.object({
  references: z.array(
    MetaSchema.omit({ whyItWorks: true }).extend({
      slug: z.string(),
      whyItWorks: z.array(z.object({ principle: PrincipleIdSchema, name: z.string(), rule: z.string(), how: z.string() })),
      html: z.string().optional(),
    }),
  ),
});

export const GetPrinciplesInput = z.object({
  ids: z.array(PrincipleIdSchema).optional().describe("Principle ids. Omit for all."),
});
export const GetPrinciplesOutput = z.object({ principles: z.array(PrincipleOut) });

export const ReviewMotionInput = z.object({
  code: z.string().describe("HTML, CSS or JS to review."),
});
export const ReviewMotionOutput = z.object({
  findings: z.array(
    z.object({
      principle: PrincipleIdSchema,
      severity: z.enum(SEVERITIES),
      message: z.string(),
      line: z.number().int(),
      excerpt: z.string(),
    }),
  ),
  counts: z.object({ error: z.number().int(), warn: z.number().int() }),
});

export const AdaptPromptArgs = {
  slugs: z.string().min(1).describe("Comma-separated reference slugs."),
  project: z.string().min(1).describe("What the user is building."),
};
