const VOCAB = ["none", "low", "high", "xhigh", "max"] as const;
type EffortLevel = (typeof VOCAB)[number];

export const EFFORT_ORDER = VOCAB;

const EFFORT_ALIASES: Readonly<Record<string, EffortLevel>> = {
  none: "none",
  off: "none",
  low: "low",
  high: "high",
  xhigh: "xhigh",
  "x-high": "xhigh",
  "x_high": "xhigh",
  "extra-high": "xhigh",
  "extra_high": "xhigh",
  max: "max",
  maximum: "max",
};

function canonicalEffort(rawVariant: string): EffortLevel | undefined {
  const normalized = rawVariant.trim().toLowerCase();
  return EFFORT_ALIASES[normalized];
}

export function normalizeEffortOptions(runtimeVariants: readonly string[]): string[] {
  const supported = new Set<EffortLevel>();

  for (const runtimeVariant of runtimeVariants) {
    const effort = canonicalEffort(runtimeVariant);
    if (effort) supported.add(effort);
  }

  return ["default", ...VOCAB.filter((effort) => supported.has(effort))];
}
