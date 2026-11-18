import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import MiniSearch from "minisearch";
import { z } from "zod";
import { FacetsSchema } from "./facets.js";
import { PRINCIPLE_BY_ID, PrincipleIdSchema } from "./principles.js";

const NonEmpty = z.string().min(1);

export const MetaSchema = z.strictObject({
  title: NonEmpty,
  summary: NonEmpty,
  facets: FacetsSchema,
  useWhen: z.array(NonEmpty).min(1),
  techniques: z.array(NonEmpty).min(1),
  whyItWorks: z
    .array(z.strictObject({ principle: PrincipleIdSchema, how: NonEmpty }))
    .min(3)
    .max(5)
    .refine((entries) => new Set(entries.map((e) => e.principle)).size === entries.length, {
      message: "each principle may appear once",
    }),
  directions: z.array(z.strictObject({ name: NonEmpty, change: NonEmpty })).min(2).max(3),
  pitfalls: z.array(NonEmpty).min(1),
  tunables: z.array(z.strictObject({ name: NonEmpty, default: NonEmpty, effect: NonEmpty })).min(1),
  reducedMotion: NonEmpty,
});

export type Meta = z.infer<typeof MetaSchema>;
export type Reference = Meta & { readonly slug: string; readonly html: string };
export type Ranked = { readonly slug: string; readonly score: number };

export type Vault = {
  readonly references: readonly Reference[];
  readonly bySlug: ReadonlyMap<string, Reference>;
  rank(brief: string): readonly Ranked[];
};

export class VaultLoadError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`vault failed to load, ${problems.length} problem(s)\n${problems.map((p) => `  ${p}`).join("\n")}`);
    this.name = "VaultLoadError";
  }
}

export const defaultVaultDir = (): string =>
  resolve(dirname(fileURLToPath(import.meta.url)), "..", "vault");

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const DOCTYPE = /^<!doctype html>/i;

type Loaded = { readonly reference: Reference } | { readonly problems: readonly string[] };

const readText = (path: string): { text: string } | { error: string } => {
  try {
    return { text: readFileSync(path, "utf8") };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
};

function loadReference(referencesDir: string, slug: string): Loaded {
  if (!SLUG.test(slug)) return { problems: [`${slug}: folder name must be lowercase letters, digits and hyphens`] };
  const problems: string[] = [];

  const metaFile = readText(join(referencesDir, slug, "meta.json"));
  const htmlFile = readText(join(referencesDir, slug, "index.html"));
  if ("error" in htmlFile) problems.push(`${slug}: index.html: ${htmlFile.error}`);
  else if (!DOCTYPE.test(htmlFile.text)) problems.push(`${slug}: index.html: must start with <!doctype html>`);

  let meta: Meta | undefined;
  if ("error" in metaFile) problems.push(`${slug}: meta.json: ${metaFile.error}`);
  else {
    let raw: unknown;
    try {
      raw = JSON.parse(metaFile.text);
    } catch (error) {
      problems.push(`${slug}: meta.json: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (raw !== undefined) {
      const parsed = MetaSchema.safeParse(raw);
      if (parsed.success) meta = parsed.data;
      else
        for (const issue of parsed.error.issues)
          problems.push(`${slug}: ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
  }

  if (meta && "text" in htmlFile)
    meta.tunables.forEach((t, i) => {
      if (!htmlFile.text.includes(t.name))
        problems.push(`${slug}: tunables.${i}.name: "${t.name}" does not appear in index.html`);
    });

  if (problems.length > 0 || !meta || !("text" in htmlFile)) return { problems };
  return { reference: { ...meta, slug, html: htmlFile.text } };
}

const STOP_WORDS = new Set(["a", "an", "and", "the", "for", "of", "to", "in", "on", "with", "that", "is", "it", "my", "our"]);

type SearchDocument = {
  id: string;
  title: string;
  useWhen: string;
  summary: string;
  techniques: string;
  facets: string;
  principles: string;
};

const toDocument = (r: Reference): SearchDocument => ({
  id: r.slug,
  title: r.title,
  useWhen: r.useWhen.join(" "),
  summary: r.summary,
  techniques: r.techniques.join(" "),
  facets: Object.values(r.facets).flat().join(" "),
  principles: r.whyItWorks.map((w) => PRINCIPLE_BY_ID.get(w.principle)?.name ?? w.principle).join(" "),
});

export function buildVault(references: readonly Reference[]): Vault {
  const index = new MiniSearch<SearchDocument>({
    fields: ["title", "useWhen", "summary", "techniques", "facets", "principles"],
    processTerm: (term) => {
      const lower = term.toLowerCase();
      return STOP_WORDS.has(lower) ? null : lower;
    },
    searchOptions: { boost: { title: 3, useWhen: 2 }, prefix: true, fuzzy: 0.2, combineWith: "OR" },
  });
  index.addAll(references.map(toDocument));
  return {
    references,
    bySlug: new Map(references.map((r) => [r.slug, r])),
    rank: (brief) =>
      index
        .search(brief)
        .map((hit) => ({ slug: String(hit.id), score: hit.score }))
        .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug)),
  };
}

export function loadVault(dir: string = defaultVaultDir()): Vault {
  const referencesDir = join(dir, "references");
  let slugs: string[];
  try {
    slugs = readdirSync(referencesDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort();
  } catch (error) {
    throw new VaultLoadError([`${referencesDir}: ${error instanceof Error ? error.message : String(error)}`]);
  }
  const loaded = slugs.map((slug) => loadReference(referencesDir, slug));
  const problems = loaded.flatMap((l) => ("problems" in l ? l.problems : []));
  if (problems.length > 0) throw new VaultLoadError(problems);
  return buildVault(loaded.flatMap((l) => ("reference" in l ? [l.reference] : [])));
}
