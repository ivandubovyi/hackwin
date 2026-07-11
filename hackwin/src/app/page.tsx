"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowDown,
  ArrowRight,
  Loader2,
  Trophy,
  Zap,
  ShieldAlert,
  Clock,
  Sparkles,
  Search,
  Link2,
  ChevronDown,
} from "lucide-react";
import type {
  HackathonInput,
  ResearchDossier,
  StrategyBrief,
  StrategyIdea,
} from "@/types/strategy";
import type { ConceptFingerprint } from "@/lib/novelty";

const emptyInput: HackathonInput = {
  name: "",
  theme: "",
  sponsors: "",
  pastWinners: "",
  constraints: "",
  url: "",
};

const stages = [
  "Finding Devpost editions…",
  "Scraping sponsors & prize tracks…",
  "Searching past-year winners…",
  "Reading project galleries…",
  "Inventing a new concept…",
  "Checking concept novelty…",
  "Checking for enough specifics…",
  "Sharpening until perfection…",
];

export default function HomePage() {
  const [input, setInput] = useState<HackathonInput>(emptyInput);
  const [brief, setBrief] = useState<StrategyBrief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stageIdx, setStageIdx] = useState(0);
  const [showOverrides, setShowOverrides] = useState(false);
  const [seenIdeas, setSeenIdeas] = useState<string[]>([]);
  const [seenConcepts, setSeenConcepts] = useState<ConceptFingerprint[]>([]);

  async function runAnalyze(opts?: { freshIdeaOnly?: boolean }) {
    setError(null);
    if (!opts?.freshIdeaOnly) setBrief(null);
    setLoading(true);
    setStageIdx(0);

    const timer = setInterval(() => {
      setStageIdx((i) => (i + 1) % stages.length);
    }, 1600);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...input,
          excludeIdeas: seenIdeas,
          excludeConcepts: seenConcepts,
          seed: Date.now() ^ Math.floor(Math.random() * 1_000_000),
          skipResearch: Boolean(opts?.freshIdeaOnly && brief?.research),
          researchCache: opts?.freshIdeaOnly ? brief?.research : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");

      const idea = data.recommendedIdea as StrategyIdea | undefined;
      if (idea?.title) {
        setSeenIdeas((prev) => {
          if (prev.some((x) => x.toLowerCase() === idea.title.toLowerCase())) {
            return prev;
          }
          return [...prev, idea.title].slice(-40);
        });
        setSeenConcepts((prev) => {
          const next: ConceptFingerprint = {
            title: idea.title,
            oneLiner: idea.oneLiner || "",
            mission: idea.mission || "",
            coreLoop: idea.coreLoop || "",
            targetUser: idea.targetUser || "",
            howItWorks: idea.howItWorks || [],
          };
          const dup = prev.some(
            (p) => p.title.toLowerCase() === next.title.toLowerCase(),
          );
          return dup ? prev : [...prev, next].slice(-40);
        });
      }

      setBrief(data);
      requestAnimationFrame(() => {
        document.getElementById("brief")?.scrollIntoView({ behavior: "smooth" });
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      clearInterval(timer);
      setLoading(false);
    }
  }

  async function analyze(e: React.FormEvent) {
    e.preventDefault();
    await runAnalyze();
  }

  function update<K extends keyof HackathonInput>(key: K, value: HackathonInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="atmosphere min-h-screen">
      <div className="grid-fade pointer-events-none absolute inset-0 h-[90vh]" />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <a href="#" className="font-[family-name:var(--font-display)] text-xl font-extrabold tracking-tight text-fg">
          Hack<span className="text-accent">Win</span>
        </a>
        <a
          href="#briefing"
          className="text-sm text-fg-muted transition hover:text-accent"
        >
          Start briefing
        </a>
      </header>

      <main className="relative z-10">
        <section className="mx-auto flex min-h-[88vh] max-w-6xl flex-col justify-center px-6 pb-20 pt-8">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 font-[family-name:var(--font-display)] text-sm font-semibold uppercase tracking-[0.22em] text-accent"
          >
            HackWin
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="max-w-4xl font-[family-name:var(--font-display)] text-5xl font-extrabold leading-[0.95] tracking-tight text-fg sm:text-7xl"
          >
            Real ideas to build.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="mt-6 max-w-xl text-lg leading-relaxed text-fg-muted"
          >
            Drop the hackathon name and URL. HackWin reads the criteria and judge
            preferences — then invents a real product idea worth building.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-10 flex flex-wrap items-center gap-4"
          >
            <a
              href="#briefing"
              className="inline-flex items-center gap-2 bg-accent px-6 py-3.5 text-sm font-bold text-bg transition hover:brightness-110"
            >
              Research a hackathon
              <ArrowDown className="h-4 w-4" />
            </a>
            <span className="text-sm text-fg-muted">
              Name + URL → criteria research → product idea
            </span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45 }}
            className="mt-20 grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-3"
          >
            {[
              {
                icon: Search,
                title: "Auto research",
                body: "Scrapes the listing, follows prize/gallery links, and searches the web for winners.",
              },
              {
                icon: Trophy,
                title: "Sponsor tracks",
                body: "Surfaces prize tracks and puts sponsor APIs in the critical path of the idea.",
              },
              {
                icon: Zap,
                title: "Winner patterns",
                body: "Learns what landed before — then invents a standalone product that fits those signals.",
              },
            ].map((item) => (
              <div key={item.title} className="bg-bg-elevated p-6">
                <item.icon className="mb-4 h-5 w-5 text-accent" />
                <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-fg">
                  {item.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">{item.body}</p>
              </div>
            ))}
          </motion.div>
        </section>

        <section id="briefing" className="border-t border-line bg-bg-elevated/60 py-20">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-4xl">
              Briefing room
            </h2>
            <p className="mt-3 max-w-2xl text-fg-muted">
              Name and URL are enough. HackWin scrapes the page, discovers prize
              tracks, and past winners — then invents a product idea that fits those signals.
            </p>

            <form onSubmit={analyze} className="mt-10 grid gap-6 lg:grid-cols-2">
              <Field
                label="Hackathon name"
                value={input.name}
                onChange={(v) => update("name", v)}
                placeholder="e.g. TreeHacks 2026"
              />
              <Field
                label="Hackathon URL"
                value={input.url || ""}
                onChange={(v) => update("url", v)}
                placeholder="https://treehacks-2026.devpost.com"
              />
              <Area
                className="lg:col-span-2"
                label="Your constraints (optional)"
                value={input.constraints}
                onChange={(v) => update("constraints", v)}
                placeholder="Team of 3, strong in Next.js + Python, weak in mobile, ~36 hours…"
                rows={3}
              />

              <div className="lg:col-span-2">
                <button
                  type="button"
                  onClick={() => setShowOverrides((v) => !v)}
                  className="inline-flex items-center gap-2 text-sm text-fg-muted transition hover:text-accent"
                >
                  <ChevronDown
                    className={`h-4 w-4 transition ${showOverrides ? "rotate-180" : ""}`}
                  />
                  Optional overrides — theme, sponsors, winners you already know
                </button>
                {showOverrides && (
                  <div className="mt-4 grid gap-6 lg:grid-cols-2">
                    <Area
                      className="lg:col-span-2"
                      label="Theme / judging (override)"
                      value={input.theme}
                      onChange={(v) => update("theme", v)}
                      placeholder="Only if you want to override what HackWin finds…"
                      rows={4}
                    />
                    <Area
                      label="Sponsors & prize tracks (override)"
                      value={input.sponsors}
                      onChange={(v) => update("sponsors", v)}
                      placeholder={"OpenAI — Best use of API ($5k)\nStripe — Fintech track"}
                      rows={5}
                    />
                    <Area
                      label="Past winners (override)"
                      value={input.pastWinners}
                      onChange={(v) => update("pastWinners", v)}
                      placeholder="Only if research misses something you know…"
                      rows={5}
                    />
                  </div>
                )}
              </div>

              <div className="lg:col-span-2 flex flex-wrap items-center gap-4 pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-2 bg-accent px-7 py-3.5 text-sm font-bold text-bg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Researching
                    </>
                  ) : (
                    <>
                      Research & invent an idea
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
                {loading && (
                  <p className="text-sm text-accent-dim">{stages[stageIdx]}</p>
                )}
                {error && <p className="text-sm text-danger">{error}</p>}
              </div>
            </form>
          </div>
        </section>

        <AnimatePresence>
          {brief && (
            <motion.section
              id="brief"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              className="border-t border-line py-20"
            >
              <BriefView
                brief={brief}
                loading={loading}
                onFreshIdea={() => runAnalyze({ freshIdeaOnly: true })}
              />
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      <footer className="border-t border-line px-6 py-8 text-center text-sm text-fg-muted">
        HackWin · Build something real — using the criteria as your compass.
      </footer>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-fg-muted">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-line bg-bg px-4 py-3 text-fg outline-none transition focus:border-accent"
      />
    </label>
  );
}

function Area({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-fg-muted">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full resize-y border border-line bg-bg px-4 py-3 text-fg outline-none transition focus:border-accent"
      />
    </label>
  );
}

function BriefView({
  brief,
  loading,
  onFreshIdea,
}: {
  brief: StrategyBrief;
  loading: boolean;
  onFreshIdea: () => void;
}) {
  const top = brief.recommendedIdea;

  return (
    <div className="mx-auto max-w-6xl space-y-14 px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Strategy brief
            {brief.demo ? " · demo mode" : ""}
          </p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-5xl">
            {brief.hackathonName}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onFreshIdea}
            disabled={loading}
            className="inline-flex items-center gap-2 border border-accent px-4 py-2.5 text-sm font-bold text-accent transition hover:bg-accent hover:text-bg disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                New idea…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate another idea
              </>
            )}
          </button>
          <div className="border border-accent bg-accent/10 px-5 py-3 text-right">
            <p className="text-xs uppercase tracking-[0.14em] text-fg-muted">Win score</p>
            <p className="font-[family-name:var(--font-display)] text-4xl font-extrabold text-accent">
              {top.scores.overall}
            </p>
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Build this
        </p>
        <IdeaHero idea={top} />
      </div>

      <div className="border border-line bg-bg-panel p-6 sm:p-8">
        <h3 className="font-[family-name:var(--font-display)] text-xl font-bold">
          Product pitch
        </h3>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-fg">{brief.pitchScript}</p>
      </div>

      {brief.weekendPlan.length > 0 && (
        <div>
          <h3 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-2xl font-bold">
            <Clock className="h-5 w-5 text-accent" />
            Weekend execution
          </h3>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {brief.weekendPlan.map((block) => (
              <div
                key={block.hour + block.focus}
                className="flex gap-4 border border-line bg-bg px-4 py-3"
              >
                <span className="w-28 shrink-0 text-sm font-semibold text-accent">{block.hour}</span>
                <span className="text-sm text-fg-muted">{block.focus}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {brief.research && <ResearchPanel research={brief.research} />}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="border border-line bg-bg-panel p-6 lg:col-span-3">
          <h3 className="font-[family-name:var(--font-display)] text-xl font-bold">
            How judges will read the theme
          </h3>
          <p className="mt-3 leading-relaxed text-fg-muted">{brief.themeRead}</p>
          <ul className="mt-5 space-y-2">
            {brief.judgeSignals.map((s) => (
              <li key={s} className="flex gap-3 text-sm text-fg">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 bg-accent" />
                {s}
              </li>
            ))}
          </ul>
        </div>
        <div className="border border-line bg-bg-panel p-6 lg:col-span-2">
          <h3 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-xl font-bold">
            <ShieldAlert className="h-5 w-5 text-danger" />
            Avoid these
          </h3>
          <ul className="mt-4 space-y-3">
            {brief.crowdedIdeasToAvoid.map((idea) => (
              <li key={idea} className="border-l-2 border-danger/50 pl-3 text-sm text-fg-muted">
                {idea}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="border border-line bg-bg-panel p-6">
          <h3 className="font-[family-name:var(--font-display)] text-xl font-bold">
            Sponsor angles
          </h3>
          <div className="mt-4 space-y-4">
            {brief.sponsorAngles.map((s) => (
              <div key={s.sponsor} className="border-t border-line pt-4 first:border-0 first:pt-0">
                <p className="font-semibold text-accent">{s.sponsor}</p>
                <p className="mt-1 text-sm text-fg">{s.angle}</p>
                <p className="mt-1 text-sm text-fg-muted">{s.prizeHook}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="border border-line bg-bg-panel p-6">
          <h3 className="font-[family-name:var(--font-display)] text-xl font-bold">
            Winner patterns
          </h3>
          <ul className="mt-4 space-y-3">
            {brief.winnerPatterns.map((p) => (
              <li key={p} className="flex gap-3 text-sm text-fg-muted">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function ResearchPanel({ research }: { research: ResearchDossier }) {
  return (
    <div className="border border-line bg-bg-panel p-6 sm:p-8">
      <div className="flex flex-wrap items-center gap-3">
        <Search className="h-5 w-5 text-accent" />
        <h3 className="font-[family-name:var(--font-display)] text-xl font-bold">
          Auto-discovered intelligence
        </h3>
      </div>

      {research.theme && (
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-fg-muted">
          <span className="font-semibold text-fg">Theme: </span>
          {research.theme}
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-fg-muted">
            Sponsors & prize tracks
          </h4>
          {research.sponsors.length ? (
            <ul className="mt-3 space-y-3">
              {research.sponsors.map((s) => (
                <li key={s.name + s.prizeTrack} className="text-sm">
                  <p className="font-semibold text-accent">{s.name}</p>
                  <p className="text-fg">{s.prizeTrack || "Prize track"}</p>
                  {s.prizeDetails && (
                    <p className="text-fg-muted">{s.prizeDetails}</p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-fg-muted">No sponsors extracted yet.</p>
          )}
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-fg-muted">
            Past winners
          </h4>
          {research.pastWinners.length ? (
            <ul className="mt-3 space-y-3">
              {research.pastWinners.map((w) => (
                <li key={w.project + w.year} className="text-sm">
                  <p className="font-semibold text-fg">
                    {w.year ? `${w.year} · ` : ""}
                    {w.project}
                  </p>
                  <p className="text-fg-muted">
                    {w.track ? `${w.track} — ` : ""}
                    {w.description || w.whyItWon}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-fg-muted">No past winners extracted yet.</p>
          )}
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-fg-muted">
            Previous projects
          </h4>
          {research.notableProjects.length ? (
            <ul className="mt-3 space-y-3">
              {research.notableProjects.map((p) => (
                <li key={p.name + p.url} className="text-sm">
                  <p className="font-semibold text-fg">{p.name}</p>
                  <p className="text-fg-muted">{p.description}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-fg-muted">No gallery projects extracted yet.</p>
          )}
        </div>
      </div>

      {research.sources.length > 0 && (
        <div className="mt-6 border-t border-line pt-4">
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-fg-muted">
            <Link2 className="h-3.5 w-3.5" />
            Sources
          </h4>
          <ul className="mt-3 flex flex-wrap gap-2">
            {research.sources.slice(0, 10).map((s) => (
              <a
                key={s.url}
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="border border-line px-2.5 py-1 text-xs text-fg-muted transition hover:border-accent hover:text-accent"
              >
                [{s.kind}] {s.title.slice(0, 48)}
              </a>
            ))}
          </ul>
        </div>
      )}

      {research.gaps.length > 0 && (
        <p className="mt-4 text-xs text-fg-muted">
          Gaps: {research.gaps.join(" · ")}
        </p>
      )}
    </div>
  );
}

function IdeaHero({ idea }: { idea: StrategyIdea }) {
  return (
    <div className="mt-4 border border-accent/40 bg-bg-panel p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-tight text-fg sm:text-5xl">
            {idea.title}
          </h3>
          <p className="mt-3 max-w-2xl text-lg text-fg-muted">{idea.oneLiner}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {idea.tracks.map((t) => (
              <span
                key={t}
                className="border border-line px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-fg-muted"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      <ScoreGrid scores={idea.scores} />

      <div className="mt-8 space-y-8">
        {idea.mission ? <Block title="Mission" body={idea.mission} /> : null}
        {idea.targetUser ? (
          <Block title="Who it's for" body={idea.targetUser} />
        ) : null}
        {idea.coreLoop ? <Block title="Core loop" body={idea.coreLoop} /> : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <ListBlock title="How it works" items={idea.howItWorks} />
          <Block title="What it looks like" body={idea.looksLike} />
          <ListBlock title="Screens" items={idea.screens} />
          <ListBlock title="How to build it" items={idea.techStack} />
          <Block title="Why build this" body={idea.whyItWins} />
          <Block title="Criteria fit" body={idea.themePlay} />
          <Block title="Sponsor play" body={idea.sponsorPlay} />
          <ListBlock title="90s demo plan" items={idea.demoPlan} />
          <ListBlock title="MVP build scope" items={idea.buildScope} />
          <ListBlock title="Risks" items={idea.risks} danger />
        </div>
      </div>
    </div>
  );
}

function ScoreGrid({ scores }: { scores: StrategyIdea["scores"] }) {
  const rows = useMemo(
    () => [
      ["Theme fit", scores.themeFit],
      ["Sponsor fit", scores.sponsorFit],
      ["Demo wow", scores.demoWow],
      ["Feasibility", scores.feasibility],
      ["Differentiation", scores.differentiation],
    ] as const,
    [scores],
  );

  return (
    <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {rows.map(([label, value]) => (
        <div key={label} className="border border-line bg-bg p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-fg-muted">{label}</span>
            <span className="font-[family-name:var(--font-display)] text-lg font-bold text-fg">
              {value}
            </span>
          </div>
          <div className="mt-2 h-1 bg-line">
            <div className="h-full bg-accent" style={{ width: `${value}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Block({ title, body }: { title: string; body: string }) {
  if (!body?.trim()) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-fg-muted">{title}</h4>
      <p className="mt-2 text-sm leading-relaxed text-fg">{body}</p>
    </div>
  );
}

function ListBlock({
  title,
  items,
  danger,
}: {
  title: string;
  items: string[];
  danger?: boolean;
}) {
  if (!items?.length) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-fg-muted">{title}</h4>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li
            key={item}
            className={`text-sm leading-relaxed ${danger ? "text-danger/90" : "text-fg"}`}
          >
            — {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
