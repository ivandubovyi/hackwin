import type { StrategyIdea } from "@/types/strategy";

const GENERIC_PHRASES = [
  /\bai[- ]powered\b/i,
  /\bleverage\b/i,
  /\bstreamline\b/i,
  /\bseamless(ly)?\b/i,
  /\binnovative solution\b/i,
  /\bcutting[- ]edge\b/i,
  /\busers can easily\b/i,
  /\bintuitive (ui|ux|dashboard|interface)\b/i,
  /\bnext[- ]gen(eration)?\b/i,
  /\brevolutionize\b/i,
  /\bempower(s|ing)?\b/i,
  /\bplatform that (helps|allows|enables)\b/i,
  /\ball[- ]in[- ]one\b/i,
  /\bsmart (app|tool|platform|system)\b/i,
];

export type SpecificityReport = {
  score: number; // 0–100
  ok: boolean;
  failures: string[];
};

/** Hard gate: idea must be concrete enough to build from. */
export function scoreIdeaSpecificity(idea: StrategyIdea): SpecificityReport {
  const failures: string[] = [];
  let score = 100;

  const mission = idea.mission?.trim() || "";
  const how = idea.howItWorks || [];
  const looks = idea.looksLike?.trim() || "";
  const user = idea.targetUser?.trim() || "";
  const loop = idea.coreLoop?.trim() || "";
  const screens = idea.screens || [];
  const stack = idea.techStack || [];
  const scope = idea.buildScope || [];
  const why = idea.whyItWins?.trim() || "";
  const one = idea.oneLiner?.trim() || "";

  if (mission.length < 80) {
    failures.push("mission too vague — need a concrete purpose (who + what change + why it matters)");
    score -= 18;
  }
  if (user.length < 24) {
    failures.push("targetUser missing — name a specific person in a specific situation");
    score -= 12;
  }
  if (loop.length < 40) {
    failures.push("coreLoop missing — describe the main interaction cycle");
    score -= 12;
  }
  if (how.length < 4) {
    failures.push("howItWorks needs ≥4 concrete steps of the product mechanics");
    score -= 16;
  } else {
    const short = how.filter((s) => s.trim().length < 35);
    if (short.length >= 2) {
      failures.push("howItWorks steps are too short — explain the actual mechanism");
      score -= 10;
    }
  }
  if (looks.length < 100) {
    failures.push("looksLike too thin — describe layout, key UI, colors/feel, what is on screen");
    score -= 14;
  }
  if (screens.length < 3) {
    failures.push("screens needs ≥3 named views with what each shows");
    score -= 12;
  }
  if (stack.length < 3) {
    failures.push("techStack needs ≥3 concrete build choices (framework, data, APIs)");
    score -= 10;
  }
  if (scope.length < 4) {
    failures.push("buildScope needs ≥4 shippable MVP pieces");
    score -= 8;
  }
  if (why.length < 80) {
    failures.push("whyItWins too generic — explain the specific wedge");
    score -= 8;
  }
  if (one.length < 20 || one.length > 160) {
    failures.push("oneLiner should be a sharp product sentence (not a slogan blob)");
    score -= 4;
  }

  const blob = [
    mission,
    looks,
    why,
    one,
    loop,
    ...how,
    ...screens,
    ...scope,
  ].join(" ");

  const genericHits = GENERIC_PHRASES.filter((re) => re.test(blob));
  if (genericHits.length >= 2) {
    failures.push(
      `too much buzzword filler (${genericHits.length} hits) — replace with concrete product detail`,
    );
    score -= 8 * Math.min(genericHits.length, 4);
  }

  // Require some concrete nouns / UI words
  const concreteSignals =
    /\b(screen|button|map|feed|timeline|canvas|camera|mic|webhook|sqlite|postgres|next\.?js|react|swift|flutter|supabase|firebase|websocket|ocr|gps|csv|pdf|inbox|calendar|sidebar|modal|card|list|grid)\b/i.test(
      blob,
    );
  if (!concreteSignals) {
    failures.push("missing concrete UI/tech nouns — name screens, controls, or stack pieces");
    score -= 10;
  }

  score = Math.max(0, Math.min(100, score));
  return {
    score,
    ok: score >= 78 && failures.length <= 1,
    failures,
  };
}

export function specificityCritique(report: SpecificityReport, idea: StrategyIdea): string {
  return `SPECIFICITY FAIL (score ${report.score}/100) for "${idea.title}".
Deepen this concept with concrete builder detail — keep the same product ONLY if it is already novel vs banned concepts. If it overlaps a banned concept, invent a different product instead.

Failures:
${report.failures.map((f) => `- ${f}`).join("\n")}

Required in recommendedIdea:
- mission: 2–4 sentences — who you serve, the change you create, why it exists
- targetUser: one specific person + situation (not "students" or "users")
- coreLoop: the repeating product action in one paragraph
- howItWorks: ≥4 steps explaining the actual mechanism (inputs → processing → output)
- looksLike: dense visual description of the UI/UX
- screens: ≥3 named screens and what each contains
- techStack: ≥3 real build choices for a weekend MVP
- buildScope: ≥4 concrete ship items
- Avoid buzzwords. Be specific enough that a builder could start coding from this alone.`;
}
