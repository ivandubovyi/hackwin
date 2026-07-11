import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDemoBrief } from "@/lib/demo";
import {
  fingerprintsFromExclude,
  noveltyCritique,
  scoreConceptNovelty,
  toFingerprint,
  type ConceptFingerprint,
} from "@/lib/novelty";
import { chatJson, getOpenAI } from "@/lib/openai";
import { SYSTEM_PROMPT, buildUserPrompt } from "@/lib/prompts";
import { researchHackathon } from "@/lib/research";
import {
  scoreIdeaSpecificity,
  specificityCritique,
} from "@/lib/specificity";
import {
  freshnessSeed,
  pickConceptDomain,
  sanitizeProductTitle,
} from "@/lib/variety";
import type { StrategyBrief, StrategyIdea } from "@/types/strategy";

export const maxDuration = 120;

const MAX_PERFECT_PASSES = 5;

const conceptSchema = z.object({
  title: z.string().default(""),
  oneLiner: z.string().default(""),
  mission: z.string().default(""),
  coreLoop: z.string().default(""),
  targetUser: z.string().default(""),
  howItWorks: z.array(z.string()).default([]),
});

const inputSchema = z.object({
  name: z.string().default(""),
  theme: z.string().default(""),
  sponsors: z.string().default(""),
  pastWinners: z.string().default(""),
  constraints: z.string().default(""),
  url: z.string().optional(),
  excludeIdeas: z.array(z.string()).default([]),
  excludeConcepts: z.array(conceptSchema).default([]),
  seed: z.number().optional(),
  skipResearch: z.boolean().optional(),
  researchCache: z.any().optional(),
});

const ideaSchema = z.object({
  rank: z.number().default(1),
  title: z.string(),
  oneLiner: z.string(),
  mission: z.string().default(""),
  targetUser: z.string().default(""),
  coreLoop: z.string().default(""),
  howItWorks: z.array(z.string()).default([]),
  looksLike: z.string().default(""),
  screens: z.array(z.string()).default([]),
  techStack: z.array(z.string()).default([]),
  tracks: z.array(z.string()).default([]),
  scores: z.object({
    themeFit: z.number(),
    sponsorFit: z.number(),
    demoWow: z.number(),
    feasibility: z.number(),
    differentiation: z.number(),
    overall: z.number(),
  }),
  whyItWins: z.string(),
  sponsorPlay: z.string().default(""),
  themePlay: z.string(),
  demoPlan: z.array(z.string()).default([]),
  buildScope: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
});

const briefSchema = z.object({
  hackathonName: z.string(),
  themeRead: z.string(),
  judgeSignals: z.array(z.string()).default([]),
  sponsorAngles: z
    .array(
      z.object({
        sponsor: z.string(),
        angle: z.string(),
        prizeHook: z.string(),
      }),
    )
    .default([]),
  winnerPatterns: z.array(z.string()).default([]),
  crowdedIdeasToAvoid: z.array(z.string()).default([]),
  recommendedIdea: ideaSchema,
  runnerUps: z.array(ideaSchema).optional().default([]),
  pitchScript: z.string(),
  weekendPlan: z
    .array(z.object({ hour: z.string(), focus: z.string() }))
    .default([]),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const input = parsed.data;
    const seed = input.seed ?? freshnessSeed();
    const excludeIdeas = dedupeTitles(input.excludeIdeas);
    let priorConcepts: ConceptFingerprint[] = fingerprintsFromExclude(
      excludeIdeas,
      input.excludeConcepts,
    );

    if (!input.name.trim() && !input.url?.trim()) {
      return NextResponse.json(
        {
          error:
            "Enter a hackathon name and/or URL — HackWin researches criteria and judge preferences, then invents a product idea to build.",
        },
        { status: 400 },
      );
    }

    let research =
      input.skipResearch && input.researchCache
        ? input.researchCache
        : await researchHackathon({
            name: input.name,
            url: input.url,
            theme: input.theme,
            sponsors: input.sponsors,
            pastWinners: input.pastWinners,
          });

    const thin =
      !research.sponsors?.length &&
      !research.pastWinners?.length &&
      !research.theme &&
      !input.theme.trim() &&
      !input.sponsors.trim() &&
      !input.pastWinners.trim();

    if (thin) {
      research.gaps = [
        ...(research.gaps || []),
        "Deep search returned little structured data — add a Devpost URL for better results.",
      ];
    }

    if (!getOpenAI()) {
      const brief = getDemoBrief(input, research, {
        excludeIdeas,
        excludeConcepts: priorConcepts,
        seed,
      });
      return NextResponse.json(brief);
    }

    const bannedText = priorConcepts.flatMap((c) => [
      c.title,
      c.oneLiner,
      c.coreLoop,
      c.targetUser,
    ]);

    let passSeed = seed;
    let forcedDomain = pickConceptDomain(passSeed, bannedText);
    let basePrompt = buildUserPrompt({
      ...input,
      research,
      excludeIdeas,
      excludeConcepts: priorConcepts,
      seed: passSeed,
      forcedDomain,
    });
    let critique = "";
    let winner: z.infer<typeof briefSchema> | null = null;
    let best: {
      data: z.infer<typeof briefSchema>;
      score: number;
    } | null = null;

    for (let pass = 0; pass < MAX_PERFECT_PASSES; pass++) {
      const userPrompt =
        basePrompt +
        (critique ? `\n\n${critique}` : "") +
        (pass > 0
          ? `\n\nPASS ${pass + 1}/${MAX_PERFECT_PASSES}: Perfection loop — concept must be NEW vs banned list, then specific enough to build.`
          : "");

      const raw = await chatJson(SYSTEM_PROMPT, userPrompt, {
        temperature: pass === 0 ? 1.05 : 0.9,
      });

      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        critique =
          "RETRY: invalid JSON. Return ONLY valid JSON with a brand-new concept and full specific fields.";
        continue;
      }

      const parsedBrief = briefSchema.safeParse(json);
      if (!parsedBrief.success) {
        critique =
          "RETRY: JSON shape invalid. Include mission, targetUser, coreLoop, howItWorks (≥4), looksLike, screens (≥3), techStack (≥3), buildScope (≥4).";
        continue;
      }

      const idea = parsedBrief.data.recommendedIdea;
      const title = idea.title;

      if (isExcluded(title, excludeIdeas)) {
        critique = `RETRY: title "${title}" already used. Invent a completely different CONCEPT (not a rename).`;
        passSeed = seed + 97 * (pass + 1);
        forcedDomain = pickConceptDomain(passSeed, [
          ...bannedText,
          title,
          idea.coreLoop,
        ]);
        priorConcepts = [...priorConcepts, toFingerprint(idea)];
        basePrompt = buildUserPrompt({
          ...input,
          research,
          excludeIdeas: [...excludeIdeas, title],
          excludeConcepts: priorConcepts,
          seed: passSeed,
          forcedDomain,
        });
        continue;
      }

      const novelty = scoreConceptNovelty(idea, priorConcepts);
      const specificity = scoreIdeaSpecificity(idea);
      const combined =
        Math.round(novelty.score * 0.45 + specificity.score * 0.55);

      if (!best || combined > best.score) {
        best = { data: parsedBrief.data, score: combined };
      }

      if (novelty.ok && specificity.ok) {
        winner = parsedBrief.data;
        break;
      }

      if (!novelty.ok) {
        // Concept collision — force a new domain and ban this concept
        priorConcepts = [...priorConcepts, toFingerprint(idea)];
        passSeed = seed + 131 * (pass + 1) + Math.floor(Math.random() * 999);
        forcedDomain = pickConceptDomain(passSeed, [
          ...bannedText,
          idea.oneLiner,
          idea.coreLoop,
          idea.targetUser,
          forcedDomain,
        ]);
        critique = noveltyCritique(novelty, idea, priorConcepts);
        basePrompt = buildUserPrompt({
          ...input,
          research,
          excludeIdeas: [...excludeIdeas, title],
          excludeConcepts: priorConcepts,
          seed: passSeed,
          forcedDomain,
        });
        continue;
      }

      // Novel enough but too vague — deepen without changing domain yet
      critique = specificityCritique(specificity, idea);
      passSeed = seed + 17 * (pass + 1);
      basePrompt = buildUserPrompt({
        ...input,
        research,
        excludeIdeas,
        excludeConcepts: priorConcepts,
        seed: passSeed,
        forcedDomain,
      });
    }

    const finalData = winner ?? best?.data;

    if (!finalData) {
      return NextResponse.json(
        { error: "Model returned an unexpected shape. Try again." },
        { status: 502 },
      );
    }

    const brief: StrategyBrief = {
      ...finalData,
      recommendedIdea: normalizeIdea(
        finalData.recommendedIdea,
        1,
        finalData.hackathonName || input.name || research.resolvedName,
      ),
      runnerUps: [],
      research,
      demo: false,
    };

    return NextResponse.json(brief);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 },
    );
  }
}

function normalizeIdea(
  idea: StrategyIdea,
  rank: number,
  hackathonName = "",
): StrategyIdea {
  return {
    ...idea,
    rank,
    title: sanitizeProductTitle(idea.title, hackathonName),
    mission: idea.mission || "",
    targetUser: idea.targetUser || "",
    coreLoop: idea.coreLoop || "",
    howItWorks: idea.howItWorks || [],
    looksLike: idea.looksLike || "",
    screens: idea.screens || [],
    techStack: idea.techStack || [],
    scores: {
      themeFit: clamp(idea.scores.themeFit),
      sponsorFit: clamp(idea.scores.sponsorFit),
      demoWow: clamp(idea.scores.demoWow),
      feasibility: clamp(idea.scores.feasibility),
      differentiation: clamp(idea.scores.differentiation),
      overall: clamp(idea.scores.overall),
    },
  };
}

function clamp(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function dedupeTitles(titles: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of titles) {
    const key = t.toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(t.trim());
  }
  return out.slice(0, 40);
}

function isExcluded(title: string, exclude: string[]): boolean {
  const t = title.toLowerCase().trim();
  return exclude.some((e) => {
    const x = e.toLowerCase().trim();
    return t === x || t.includes(x) || x.includes(t);
  });
}
