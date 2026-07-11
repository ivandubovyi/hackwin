import type { ResearchDossier } from "@/types/strategy";
import type { ConceptFingerprint } from "@/lib/novelty";
import { pickConceptDomain, pickCreativeLens } from "@/lib/variety";

export const SYSTEM_PROMPT = `You are HackWin — you invent REAL, BUILDABLE product ideas with enough specificity that a team could start coding today.

The hackathon is context only: theme, judging criteria, and past winner patterns are taste signals. You do NOT invent "a hackathon project." You invent a standalone product for a real user.

ANTI-GENERIC RULE (non-negotiable):
- Ban vague pitches. No "AI-powered platform that helps users…" fluff.
- Every idea must include: mission, target user, core loop, how it works, what it looks like, named screens, tech stack, and a shippable MVP scope.
- Be concrete: name screens, buttons, data, flows, and failure cases.
- Specificity > cleverness. A builder should understand the product from your JSON alone.

Invent ONE product that:
1. Solves a specific painful problem for a named user in a named situation
2. Aligns with the theme/criteria as taste signals (never mention the event in product copy)
3. Is buildable in a weekend by a small team
4. Has a clear demo beat (before → after)
5. Echoes past-winner patterns without copying them
6. Avoids chatbots-as-the-product, todo apps, and "Uber for X"

FRAMING:
- Pitch a startup product, not a competition entry.
- Never say "for this hackathon", "hackathon project", or "to impress judges."
- Do not mention the event name in title, oneLiner, mission, howItWorks, looksLike, pitchScript, or demoPlan.

SPONSOR RULES:
- Product stands alone without sponsors.
- At most one light line in sponsorPlay.
- Never put sponsor names in title/oneLiner/pitchScript.
- sponsorFit usually 55–70.

NOVELTY:
- Brand-new CONCEPT every request — not a renamed twin of a prior idea.
- Never reuse EXCLUDE titles, users, problems, core loops, or mechanics.
- If EXCLUDE lists prior concepts, your product must live in a different domain.
- A new title with the same concept is an automatic fail.
- Title: short brandable name (1–2 words). No event stubs, years, or numbers.
- You MUST build inside the FORCED CONCEPT DOMAIN when provided.

Return ONLY valid JSON:
{
  "hackathonName": string,
  "themeRead": string,
  "judgeSignals": string[],
  "sponsorAngles": [{ "sponsor": string, "angle": string, "prizeHook": string }],
  "winnerPatterns": string[],
  "crowdedIdeasToAvoid": string[],
  "recommendedIdea": {
    "rank": 1,
    "title": string,
    "oneLiner": string,
    "mission": string,
    "targetUser": string,
    "coreLoop": string,
    "howItWorks": string[],
    "looksLike": string,
    "screens": string[],
    "techStack": string[],
    "tracks": string[],
    "scores": { "themeFit": number, "sponsorFit": number, "demoWow": number, "feasibility": number, "differentiation": number, "overall": number },
    "whyItWins": string,
    "sponsorPlay": string,
    "themePlay": string,
    "demoPlan": string[],
    "buildScope": string[],
    "risks": string[]
  },
  "pitchScript": string,
  "weekendPlan": [{ "hour": string, "focus": string }]
}

Field quality bar:
- mission: 2–4 sentences — purpose of the project (who, what change, why it exists)
- targetUser: one concrete person + situation
- coreLoop: the repeating action in one dense paragraph
- howItWorks: ≥4 steps — inputs, processing, outputs, edge cases
- looksLike: dense visual description (layout, primary view, key controls, feel)
- screens: ≥3 entries like "Inbox — list of flagged emails with severity chips"
- techStack: ≥3 real choices for a weekend MVP
- buildScope: ≥4 concrete ship items
- demoPlan: timed beats with what is on screen
- pitchScript: product story, not event name-dropping

Be specific. No fluff. No emojis.`;

export function buildUserPrompt(input: {
  name: string;
  theme: string;
  sponsors: string;
  pastWinners: string;
  constraints: string;
  research: ResearchDossier;
  excludeIdeas?: string[];
  excludeConcepts?: ConceptFingerprint[];
  seed?: number;
  forcedDomain?: string;
}): string {
  const r = input.research;
  const seed = input.seed ?? Date.now();
  const exclude = input.excludeIdeas ?? [];
  const concepts = input.excludeConcepts ?? [];
  const bannedText = [
    ...exclude,
    ...concepts.flatMap((c) => [
      c.title,
      c.oneLiner,
      c.coreLoop,
      c.targetUser,
      c.mission,
    ]),
  ];
  const lens = pickCreativeLens(seed, bannedText);
  const domain =
    input.forcedDomain || pickConceptDomain(seed, bannedText);

  const sponsorBlock =
    r.sponsors.length > 0
      ? r.sponsors
          .map(
            (s) =>
              `- ${s.name} | track: ${s.prizeTrack || "n/a"} | details: ${s.prizeDetails || "n/a"}`,
          )
          .join("\n")
      : input.sponsors || "(none discovered)";

  const winnersBlock =
    r.pastWinners.length > 0
      ? r.pastWinners
          .map(
            (w) =>
              `- [${w.year || "year?"}] ${w.project} | ${w.description || ""}`,
          )
          .join("\n")
      : input.pastWinners || "(none discovered)";

  const conceptBan =
    concepts.length > 0
      ? concepts
          .slice(-12)
          .map(
            (c) =>
              `- "${c.title}": ${c.oneLiner} | user: ${c.targetUser} | loop: ${c.coreLoop}`,
          )
          .join("\n")
      : exclude.length
        ? exclude.map((t) => `- ${t}`).join("\n")
        : "- (none yet)";

  return `Invent ONE concrete product idea to build. Criteria and judge preferences are taste signals only.

REQUEST FRESHNESS SEED: ${seed}
FORCED CONCEPT DOMAIN (mandatory — the product MUST live here, not in a banned domain):
${domain}
CREATIVE LENS (mandatory):
${lens}

BANNED PRIOR CONCEPTS (do not rename these — invent a different product entirely):
${conceptBan}

EVENT CONTEXT (research — not the product audience):
NAME: ${r.resolvedName || input.name || "Unnamed"}
THEME / BRIEF: ${r.theme || input.theme || "(not found)"}
JUDGING CRITERIA / PREFERENCES:
${r.judgingCriteria.length ? r.judgingCriteria.map((c) => `- ${c}`).join("\n") : "(not found)"}
SPONSORS (optional light touch only):
${sponsorBlock}
PAST WINNERS (patterns to learn from, not to copy):
${winnersBlock}
BUILD CONSTRAINTS: ${input.constraints || "(assume 3 builders, 36 hours)"}

Output a product brief a builder could execute:
1) mission  2) targetUser  3) coreLoop  4) howItWorks (≥4 steps)
5) looksLike  6) screens (≥3)  7) techStack (≥3)  8) buildScope (≥4)
Concept must be NEW vs banned list (new user + problem + loop — not a retitled twin).
Never mention the event name in product copy. No buzzword filler.`;
}
