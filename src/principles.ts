import { z } from "zod";
import { DETECTORS, type Detector } from "./detectors.js";

export const PRINCIPLE_IDS = [
  "continuity",
  "purpose",
  "frequency",
  "easing",
  "timing",
  "choreography",
  "responsiveness",
  "performance",
  "restraint",
  "reduced-motion",
  "masking",
  "physicality",
  "parity",
] as const;

export type PrincipleId = (typeof PRINCIPLE_IDS)[number];
export const PrincipleIdSchema = z.enum(PRINCIPLE_IDS);

export type PrincipleRecord = {
  readonly name: string;
  readonly rule: string;
  readonly why: string;
  readonly apply: string;
  readonly failure: string;
  readonly detectors?: readonly Detector[];
};

export type Principle = Omit<PrincipleRecord, "detectors"> & {
  readonly id: PrincipleId;
  readonly detectors: readonly Detector[];
};

const REGISTRY: Record<PrincipleId, PrincipleRecord> = {
  continuity: {
    name: "Continuity",
    rule: "Things appear from where they came from and go back there.",
    why: "A spatial link between trigger and result lets people predict the interface.",
    apply:
      "Set transform-origin or clip-path origin to the trigger. Use shared-element transitions between views.",
    failure: "Panels that pop in from nowhere or slide from an unrelated edge.",
  },
  purpose: {
    name: "Motion has a job",
    rule: "Every animation explains a change of state, hierarchy or cause.",
    why: "Decorative motion costs attention and reads as noise.",
    apply:
      "Name the change the motion explains before writing it. Save decorative flourishes for rare moments such as a first load.",
    failure: "Everything bounces and nothing means anything.",
  },
  frequency: {
    name: "Quieter when frequent",
    rule: "The more often an interaction is seen, the faster and subtler it is.",
    why: "Delight on the first view becomes friction on the hundredth.",
    apply:
      "Hover and toggle feedback 100 to 200ms, small distances. Page-level moments may run longer once per visit.",
    failure: "A 600ms menu that people open fifty times a day.",
  },
  easing: {
    name: "Ease with intent",
    rule: "Ease-out for things entering or responding, ease-in for things leaving, ease-in-out for things moving across the screen.",
    why: "Linear motion reads as mechanical. The wrong curve feels sluggish.",
    apply:
      "A strong ease-out such as cubic-bezier(0.22, 1, 0.36, 1) for entrances. Linear only for loops and scroll-linked progress.",
    failure: "Linear fades, or ease-in on a response so it feels delayed.",
    detectors: [DETECTORS.linearEasing],
  },
  timing: {
    name: "A duration scale",
    rule: "Pick durations from a small scale and make exits faster than entrances.",
    why: "Consistent timing reads as one system. Quick exits keep the user moving.",
    apply:
      "Micro 120 to 200ms, standard 200 to 400ms, large or page 400 to 800ms. Exits about 25 percent shorter.",
    failure: "Transitions over a second on routine UI.",
    detectors: [DETECTORS.longDuration],
  },
  choreography: {
    name: "Stagger with a lead",
    rule: "Offset related elements so the eye follows one path, starting with the most important.",
    why: "Everything at once is a flash. A sequence tells the eye where to go.",
    apply: "30 to 80ms between items. Cap total stagger near 400ms.",
    failure: "A list whose last item lands a second after the first.",
  },
  responsiveness: {
    name: "Respond now, stay interruptible",
    rule: "Acknowledge input within 100ms and let any animation be reversed mid-flight.",
    why: "Motion that blocks input makes the interface feel slow.",
    apply: "Use transitions or springs that retarget. Never lock input until an animation ends.",
    failure: "A menu that ignores the close click until its open animation finishes.",
  },
  performance: {
    name: "Compositor-only properties",
    rule: "Animate transform, opacity and clip-path. Avoid layout properties.",
    why: "Layout properties force reflow every frame and drop frames on real devices.",
    apply: "Translate instead of top or left. Scale instead of width or height. Use will-change only while animating.",
    failure: "Janky motion on a mid-range phone.",
    detectors: [DETECTORS.layoutTransition, DETECTORS.transitionAll],
  },
  restraint: {
    name: "One hero per view",
    rule: "One focal motion per screen. Everything else supports it.",
    why: "Competing motion splits attention and cheapens the strong moment.",
    apply: "If two things want to be the hero, make one still.",
    failure: "Parallax, a marquee and a cursor trail all on one screen.",
  },
  "reduced-motion": {
    name: "Respect the setting",
    rule: "Honor prefers-reduced-motion by replacing movement with a fade or an instant change.",
    why: "Large motion causes real discomfort for people with vestibular disorders.",
    apply: "Keep state changes visible. Remove travel, parallax and auto-play.",
    failure: "A reduced-motion user still gets a full-screen wipe.",
    detectors: [DETECTORS.missingReducedMotion],
  },
  masking: {
    name: "Reveal through a mask",
    rule: "Reveal content by moving it inside a clip or mask, not by sliding it across other content.",
    why: "Masked reveals feel precise and keep the layout still.",
    apply: "Overflow hidden or clip-path on the parent. Translate the child by its own height.",
    failure: "Text flying in from off-screen across the layout.",
  },
  physicality: {
    name: "Weight and damping",
    rule: "Pointer-driven motion follows with damping or springs, not raw coordinates.",
    why: "A small lag gives an object mass and smooths jitter.",
    apply: "Lerp factor 0.08 to 0.2 per frame in a requestAnimationFrame loop, or a spring with high damping.",
    failure: "Elements that twitch 1:1 with the mouse.",
    detectors: [DETECTORS.pointerWithoutFrameLoop],
  },
  parity: {
    name: "Every input gets the effect",
    rule: "Anything revealed on hover is also reachable by keyboard focus and touch.",
    why: "Hover-only detail excludes keyboard and touch users.",
    apply: "Pair :hover with :focus-visible. Use @media (hover: hover) for pointer-only flourishes.",
    failure: "A card whose details exist only on mouse hover.",
    detectors: [DETECTORS.hoverWithoutFocus],
  },
};

export const PRINCIPLES: readonly Principle[] = PRINCIPLE_IDS.map((id) => ({
  id,
  ...REGISTRY[id],
  detectors: REGISTRY[id].detectors ?? [],
}));

export const PRINCIPLE_BY_ID: ReadonlyMap<PrincipleId, Principle> = new Map(PRINCIPLES.map((p) => [p.id, p]));

export const principlesMarkdown = (): string =>
  [
    "# Motion principles",
    ...PRINCIPLES.map(
      (p) =>
        `## ${p.name} (${p.id})\n\nRule. ${p.rule}\n\nWhy. ${p.why}\n\nApply. ${p.apply}\n\nFailure. ${p.failure}`,
    ),
  ].join("\n\n");
