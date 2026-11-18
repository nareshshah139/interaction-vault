import { z } from "zod";

export const FACETS = {
  interaction: [
    "card-hover",
    "cursor-interaction",
    "media-showcase",
    "scroll-animation",
    "horizontal-scroll",
    "parallax",
    "pinned-scroll",
    "stacked-scroll",
    "text-showcase",
    "text-reveal",
    "contextual-transition",
    "page-transition",
    "preloader",
    "section-transition",
  ],
  section: [
    "cta",
    "footer",
    "hero",
    "navigation",
    "drawer",
    "dropdown",
    "fullscreen",
    "morphing",
    "about",
    "features",
    "portfolio",
    "pricing",
    "case-study",
    "testimonial",
    "stats",
    "team",
    "timeline",
    "faq",
    "contact",
    "products",
    "services",
  ],
  element: ["3d", "accordion", "button", "card", "carousel", "list", "modal", "rows"],
  style: [
    "brutalist",
    "corporate",
    "editorial",
    "experimental",
    "image-led",
    "luxury",
    "maximalist",
    "minimal",
    "organic",
    "playful",
    "retro",
  ],
  industry: [
    "ai",
    "architecture",
    "art",
    "crypto",
    "education",
    "fashion",
    "finance",
    "food",
    "health",
    "hospitality",
    "industrial",
    "legal",
    "media",
    "music",
    "portfolio",
    "product-design",
    "real-estate",
    "saas",
    "sports",
    "studio",
    "video",
  ],
} as const;

export type FacetGroup = keyof typeof FACETS;
export type FacetValue<G extends FacetGroup> = (typeof FACETS)[G][number];

export const FACET_GROUPS = Object.keys(FACETS) as FacetGroup[];

export const FAMILIES = ["pointer", "scroll", "transition"] as const;
export type Family = (typeof FAMILIES)[number];

export const FAMILY_OF: Record<FacetValue<"interaction">, Family> = {
  "card-hover": "pointer",
  "cursor-interaction": "pointer",
  "media-showcase": "scroll",
  "scroll-animation": "scroll",
  "horizontal-scroll": "scroll",
  parallax: "scroll",
  "pinned-scroll": "scroll",
  "stacked-scroll": "scroll",
  "text-showcase": "scroll",
  "text-reveal": "scroll",
  "contextual-transition": "transition",
  "page-transition": "transition",
  preloader: "transition",
  "section-transition": "transition",
};

const values = <G extends FacetGroup>(group: G) => z.enum(FACETS[group]);

export const FacetsSchema = z.strictObject({
  interaction: z.tuple([values("interaction")], values("interaction")),
  section: z.array(values("section")),
  element: z.array(values("element")),
  style: z.array(values("style")),
  industry: z.array(values("industry")),
});
export type Facets = z.infer<typeof FacetsSchema>;

export const FacetFilterSchema = z.strictObject({
  interaction: z.array(values("interaction")).optional(),
  section: z.array(values("section")).optional(),
  element: z.array(values("element")).optional(),
  style: z.array(values("style")).optional(),
  industry: z.array(values("industry")).optional(),
});
export type FacetFilter = z.infer<typeof FacetFilterSchema>;
