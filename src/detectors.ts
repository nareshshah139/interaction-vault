export const SEVERITIES = ["error", "warn"] as const;
export type Severity = (typeof SEVERITIES)[number];

export type Hit = { readonly line: number; readonly message: string };

export type Detector = {
  readonly severity: Severity;
  run(code: string): readonly Hit[];
};

const lineAt = (code: string, index: number): number => {
  let line = 1;
  for (let i = 0; i < index; i++) if (code.charCodeAt(i) === 10) line++;
  return line;
};

const splitTopLevel = (value: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(value.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
};

const matchClose = (code: string, openIndex: number): number => {
  const open = code[openIndex];
  const close = open === "(" ? ")" : "}";
  let depth = 0;
  let quote = "";
  for (let i = openIndex; i < code.length; i++) {
    const ch = code[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return i;
  }
  return code.length;
};

const enclosingBlock = (code: string, index: number): string => {
  const start = code.lastIndexOf("{", index);
  const end = code.indexOf("}", index);
  return code.slice(start < 0 ? 0 : start, end < 0 ? code.length : end);
};

type Declaration = {
  readonly property: string;
  readonly value: string;
  readonly line: number;
  readonly infinite: boolean;
  readonly scrollLinked: boolean;
};

const MOTION_DECLARATION =
  /(?<![\w-])(transition(?:-property|-duration|-timing-function)?|animation(?:-duration|-timing-function)?)\s*:\s*([^;{}]*)/g;

const motionDeclarations = (code: string): Declaration[] =>
  [...code.matchAll(MOTION_DECLARATION)].flatMap((m) => {
    const [, property, value] = m;
    if (property === undefined || value === undefined) return [];
    const block = enclosingBlock(code, m.index);
    return [
      {
        property,
        value,
        line: lineAt(code, m.index),
        infinite: /\binfinite\b/.test(block),
        scrollLinked: /\banimation-timeline\b/.test(block),
      },
    ];
  });

const isTransition = (d: Declaration) => d.property.startsWith("transition");
const tokens = (value: string): string[] => value.toLowerCase().match(/(?<![\w-])[a-z]+(?:-[a-z]+)*/g) ?? [];

const LAYOUT_PROPERTY =
  /^(?:(?:min-|max-)?(?:width|height)|top|left|right|bottom|margin(?:-[a-z]+)*|padding(?:-[a-z]+)*)$/;
const KEYFRAME_LAYOUT_DECLARATION =
  /(?<![\w-])((?:min-|max-)?(?:width|height)|top|left|right|bottom|margin(?:-[a-z]+)*|padding(?:-[a-z]+)*)\s*:/g;

const layoutTransition: Detector = {
  severity: "error",
  run(code) {
    const hits: Hit[] = [];
    for (const d of motionDeclarations(code)) {
      if (d.property !== "transition" && d.property !== "transition-property") continue;
      const named = tokens(d.value).filter((t) => LAYOUT_PROPERTY.test(t));
      if (named.length > 0)
        hits.push({
          line: d.line,
          message: `${d.property} animates layout property ${[...new Set(named)].join(", ")}. Animate transform, opacity, clip-path or filter instead.`,
        });
    }
    for (const m of code.matchAll(/@(?:-webkit-)?keyframes\s+[\w-]+\s*\{/g)) {
      const open = m.index + m[0].length - 1;
      const block = code.slice(open, matchClose(code, open));
      for (const k of block.matchAll(KEYFRAME_LAYOUT_DECLARATION))
        hits.push({
          line: lineAt(code, open + k.index),
          message: `@keyframes sets layout property ${k[1]}. Animate transform, opacity, clip-path or filter instead.`,
        });
    }
    return hits;
  },
};

const transitionAll: Detector = {
  severity: "warn",
  run: (code) =>
    motionDeclarations(code)
      .filter((d) => (d.property === "transition" || d.property === "transition-property") && tokens(d.value).includes("all"))
      .map((d) => ({
        line: d.line,
        message: `${d.property} uses all. Name the properties that change.`,
      })),
};

const MOTION_USE = /(?<![\w-])(?:transition|animation)(?:-[a-z]+)?\s*[:=]|@keyframes|\.animate\(|requestAnimationFrame/;

const missingReducedMotion: Detector = {
  severity: "error",
  run(code) {
    const use = MOTION_USE.exec(code);
    if (!use || code.includes("prefers-reduced-motion")) return [];
    return [
      {
        line: lineAt(code, use.index),
        message: "Code animates but has no prefers-reduced-motion handling. Add a media query that removes movement.",
      },
    ];
  },
};

const LINEAR = /(?<![\w-])linear(?![\w(-])/;

const linearEasing: Detector = {
  severity: "warn",
  run: (code) =>
    motionDeclarations(code)
      .filter((d) => {
        if (d.property.endsWith("-duration") || !LINEAR.test(d.value)) return false;
        return isTransition(d) || !(d.infinite || d.scrollLinked);
      })
      .map((d) => ({
        line: d.line,
        message: `${d.property} uses linear easing. Use an ease-out curve, or keep linear for infinite loops and scroll-linked progress.`,
      })),
};

const TIME = /(?<![\w.-])(\d*\.?\d+)(ms|s)(?!\w)/;

const toMs = (segment: string): number | undefined => {
  const m = TIME.exec(segment);
  if (!m) return undefined;
  const [, amount, unit] = m;
  return Number(amount) * (unit === "s" ? 1000 : 1);
};

const longDuration: Detector = {
  severity: "warn",
  run: (code) =>
    motionDeclarations(code)
      .filter((d) => !d.property.endsWith("-timing-function") && (isTransition(d) || !d.infinite))
      .flatMap((d) => {
        const slow = splitTopLevel(d.value)
          .map((segment) => ({ segment: segment.trim(), ms: toMs(segment) }))
          .filter((s) => s.ms !== undefined && s.ms > 1000);
        if (slow.length === 0) return [];
        const durations = slow.map((s) => TIME.exec(s.segment)?.[0]).join(", ");
        return [
          {
            line: d.line,
            message: `${d.property} runs ${durations}, over 1000ms. Keep routine motion under one second.`,
          },
        ];
      }),
};

const HAS_FOCUS_STATE = /:focus-visible|:focus-within/;
const FOCUS_STATE = /:focus-visible|:focus-within/g;

const cssRegions = (code: string): { text: string; offset: number }[] => {
  const styles = [...code.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)];
  if (styles.length === 0) return [{ text: code, offset: 0 }];
  return styles.map((m) => ({ text: m[1] ?? "", offset: m.index + m[0].indexOf(">") + 1 }));
};

const normaliseSelector = (selector: string): string => selector.replace(/\s+/g, " ").trim();

const hoverWithoutFocus: Detector = {
  severity: "warn",
  run(code) {
    const hovers: { base: string; line: number; selector: string }[] = [];
    const focusBases = new Set<string>();
    for (const { text, offset } of cssRegions(code)) {
      for (const rule of text.matchAll(/([^{}]+)\{/g)) {
        const prelude = rule[1] ?? "";
        if (prelude.trim().startsWith("@")) continue;
        for (const part of splitTopLevel(prelude)) {
          const selector = normaliseSelector(part);
          if (selector.includes(":hover"))
            hovers.push({
              base: selector.replace(/:hover/g, ""),
              selector,
              line: lineAt(code, offset + rule.index + prelude.indexOf(part) + part.search(/\S/)),
            });
          if (HAS_FOCUS_STATE.test(selector)) focusBases.add(selector.replace(FOCUS_STATE, ""));
        }
      }
    }
    return hovers
      .filter((h) => !focusBases.has(h.base))
      .map((h) => ({
        line: h.line,
        message: `${h.selector} has no :focus-visible or :focus-within counterpart for ${h.base || "its base selector"}.`,
      }));
  },
};

const STYLE_WRITE = /\.style\.transform\s*[+\-*]?=(?!=)|\.style\.setProperty\(\s*['"`]--/;

const handlerDefinition = (code: string, name: string): string | undefined => {
  const escaped = name.replace(/\$/g, "\\$");
  const header = new RegExp(
    `(?:function\\s+${escaped}\\s*\\([^)]*\\)|(?:const|let|var)\\s+${escaped}\\s*=\\s*(?:async\\s*)?(?:function\\s*\\w*\\s*\\([^)]*\\)|\\([^)]*\\)\\s*=>|[\\w$]+\\s*=>))\\s*\\{`,
  ).exec(code);
  if (!header) return undefined;
  const open = header.index + header[0].length - 1;
  return code.slice(open, matchClose(code, open));
};

const pointerWithoutFrameLoop: Detector = {
  severity: "warn",
  run(code) {
    if (code.includes("requestAnimationFrame")) return [];
    const hits: Hit[] = [];
    for (const m of code.matchAll(/addEventListener\(\s*(['"`])(?:pointermove|mousemove)\1\s*,/g)) {
      const callOpen = m.index + "addEventListener".length;
      const args = code.slice(m.index + m[0].length, matchClose(code, callOpen));
      const named = /^\s*([A-Za-z_$][\w$]*)\s*(?:,|$)/.exec(args)?.[1];
      const body = named ? handlerDefinition(code, named) : args;
      if (body && STYLE_WRITE.test(body))
        hits.push({
          line: lineAt(code, m.index),
          message: "Pointer handler writes style directly with no requestAnimationFrame loop. Damp the motion in a frame loop.",
        });
    }
    return hits;
  },
};

export const DETECTORS = {
  layoutTransition,
  transitionAll,
  missingReducedMotion,
  linearEasing,
  longDuration,
  hoverWithoutFocus,
  pointerWithoutFrameLoop,
} as const satisfies Record<string, Detector>;
