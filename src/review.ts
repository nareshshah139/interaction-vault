import { type Severity } from "./detectors.js";
import { PRINCIPLES, type PrincipleId } from "./principles.js";

export type Finding = {
  readonly principle: PrincipleId;
  readonly severity: Severity;
  readonly message: string;
  readonly line: number;
  readonly excerpt: string;
};

const blank = (text: string) => text.replace(/[^\n]/g, " ");

const blankComments = (code: string): string =>
  code
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/(^|\s)\/\/.*$/gm, (whole, lead: string) => lead + blank(whole.slice(lead.length)));

export function reviewMotion(code: string): Finding[] {
  const clean = blankComments(code);
  const lines = code.split(/\r?\n/);
  return PRINCIPLES.flatMap((principle) =>
    principle.detectors.flatMap((detector) =>
      detector.run(clean).map((hit) => ({
        principle: principle.id,
        severity: detector.severity,
        message: hit.message,
        line: hit.line,
        excerpt: (lines[hit.line - 1] ?? "").trim().slice(0, 160),
      })),
    ),
  ).sort((a, b) => a.line - b.line);
}

export const countBySeverity = (findings: readonly Finding[]): Record<Severity, number> => ({
  error: findings.filter((f) => f.severity === "error").length,
  warn: findings.filter((f) => f.severity === "warn").length,
});
