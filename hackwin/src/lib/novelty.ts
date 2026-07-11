import type { StrategyIdea } from "@/types/strategy";

export type ConceptFingerprint = {
  title: string;
  oneLiner: string;
  mission: string;
  coreLoop: string;
  targetUser: string;
  howItWorks: string[];
};

const STOP = new Set([
  "a", "an", "the", "and", "or", "to", "of", "in", "on", "for", "with", "that",
  "this", "from", "into", "via", "using", "user", "users", "app", "product",
  "build", "built", "real", "time", "live", "data", "system", "tool", "based",
]);

/** Stable tokens that define the product concept (not the brand name). */
export function conceptTokens(idea: Partial<ConceptFingerprint>): Set<string> {
  const blob = [
    idea.oneLiner,
    idea.mission,
    idea.coreLoop,
    idea.targetUser,
    ...(idea.howItWorks || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const raw = blob
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

  return new Set(raw);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export type NoveltyReport = {
  score: number; // 0–100 higher = more novel
  ok: boolean;
  failures: string[];
  closestOverlap: number;
  closestTitle?: string;
};

/**
 * Hard gate: concept must differ from prior ideas — not just the title.
 * Overlap on mechanics/user/loop fails even if the brand name is new.
 */
export function scoreConceptNovelty(
  idea: StrategyIdea,
  prior: ConceptFingerprint[],
): NoveltyReport {
  if (!prior.length) {
    return { score: 100, ok: true, failures: [], closestOverlap: 0 };
  }

  const mine = conceptTokens(idea);
  let closest = 0;
  let closestTitle = "";

  for (const p of prior) {
    const overlap = jaccard(mine, conceptTokens(p));
    if (overlap > closest) {
      closest = overlap;
      closestTitle = p.title;
    }
  }

  const failures: string[] = [];
  let score = Math.round((1 - closest) * 100);

  // Title-only rename detection: same coreLoop / oneLiner vibe
  const titleOnly =
    prior.some((p) => {
      const loopSim = jaccard(
        conceptTokens({ coreLoop: idea.coreLoop, howItWorks: idea.howItWorks }),
        conceptTokens({ coreLoop: p.coreLoop, howItWorks: p.howItWorks }),
      );
      return loopSim >= 0.45 && p.title.toLowerCase() !== idea.title.toLowerCase();
    }) || closest >= 0.38;

  if (closest >= 0.28) {
    failures.push(
      `concept too similar to prior idea "${closestTitle}" (overlap ${Math.round(closest * 100)}%) — changing the name is not enough`,
    );
    score = Math.min(score, 55);
  }
  if (titleOnly) {
    failures.push(
      "this looks like a rename of a previous concept — invent a different product: new user, new problem, new core loop, new UI",
    );
    score = Math.min(score, 40);
  }

  // Shared distinctive mechanic keywords across priors
  const bannedMechanics = extractMechanics(prior);
  const myMechanics = extractMechanics([idea]);
  const shared = [...myMechanics].filter((m) => bannedMechanics.has(m));
  if (shared.length >= 2) {
    failures.push(
      `reuses prior mechanics (${shared.slice(0, 4).join(", ")}) — pick a different domain`,
    );
    score = Math.min(score, 45);
  }

  score = Math.max(0, Math.min(100, score));
  return {
    score,
    ok: failures.length === 0 && closest < 0.28,
    failures,
    closestOverlap: closest,
    closestTitle: closestTitle || undefined,
  };
}

function extractMechanics(ideas: Partial<ConceptFingerprint>[]): Set<string> {
  const keys = [
    "webcam", "camera", "filler", "rehearsal", "pitch", "speech", "stt",
    "map", "gps", "inbox", "email", "calendar", "ocr", "pdf", "forgery",
    "marketplace", "match", "scoreboard", "game", "voice", "mic",
    "privacy", "consent", "offline", "ledger", "payment", "budget",
    "rubric", "grade", "coach", "triage", "crisis", "sensor",
    "verification", "fake", "deepfake", "timeline", "canvas",
  ];
  const blob = ideas
    .map((i) =>
      [i.oneLiner, i.mission, i.coreLoop, i.targetUser, ...(i.howItWorks || [])]
        .filter(Boolean)
        .join(" "),
    )
    .join(" ")
    .toLowerCase();
  return new Set(keys.filter((k) => blob.includes(k)));
}

export function noveltyCritique(
  report: NoveltyReport,
  idea: StrategyIdea,
  prior: ConceptFingerprint[],
): string {
  const priorBlock = prior
    .slice(-12)
    .map(
      (p) =>
        `- BANNED CONCEPT "${p.title}": ${p.oneLiner} | user=${p.targetUser} | loop=${p.coreLoop}`,
    )
    .join("\n");

  return `CONCEPT NOVELTY FAIL (score ${report.score}/100) for "${idea.title}".
Do NOT rename or lightly tweak this idea. Invent an entirely different product.

Failures:
${report.failures.map((f) => `- ${f}`).join("\n")}

Prior concepts you must not echo (name OR mechanic OR user OR loop):
${priorBlock || "- (none)"}

Mandatory differences vs every prior:
- different domain / problem space
- different targetUser situation
- different coreLoop
- different screens and howItWorks
- different mission

A new title with the same concept is an automatic fail.`;
}

export function toFingerprint(idea: StrategyIdea): ConceptFingerprint {
  return {
    title: idea.title,
    oneLiner: idea.oneLiner,
    mission: idea.mission,
    coreLoop: idea.coreLoop,
    targetUser: idea.targetUser,
    howItWorks: idea.howItWorks || [],
  };
}

export function fingerprintsFromExclude(
  excludeIdeas: string[],
  excludeConcepts: ConceptFingerprint[] = [],
): ConceptFingerprint[] {
  const fromStructured = excludeConcepts.filter((c) => c.title || c.oneLiner || c.coreLoop);
  const fromTitles = excludeIdeas
    .filter((t) => t.trim())
    .filter((t) => !fromStructured.some((c) => c.title.toLowerCase() === t.toLowerCase()))
    .map((title) => ({
      title,
      oneLiner: title,
      mission: "",
      coreLoop: "",
      targetUser: "",
      howItWorks: [] as string[],
    }));
  return [...fromStructured, ...fromTitles].slice(-40);
}
