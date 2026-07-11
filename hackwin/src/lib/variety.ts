/** Creative lenses that force a different product shape each run. */
export const CREATIVE_LENSES = [
  "live before/after transformation the audience feels in under 20 seconds",
  "tool that makes an API the hero of a physical-world moment",
  "adversarial / game-like loop with a visible scoreboard",
  "accessibility or inclusion wedge that is emotionally undeniable",
  "ops / crisis triage for a specific profession (not generic alerts)",
  "creator or student workflow that kills a painful multi-step ritual",
  "trust / verification product where the demo proves something was fake or real",
  "local-first or offline-capable twist with one cloud wow moment",
  "multiplayer collaboration moment with a single dramatic sync",
  "hardware-adjacent or sensor-light demo (webcam, mic, phone)",
  "marketplace or matching engine with a single dramatic match",
  "time-travel / simulation of consequences (what happens if you choose wrong)",
  "voice-first interface that replaces a clunky form or dashboard",
  "memory / personalization agent that surprises with one eerily useful recall",
  "safety / consent / privacy guardian that blocks a bad action live",
  "education coach that grades work against a concrete rubric live",
  "finance or resource allocator that makes a money decision in one click",
  "map / spatial interface where the insight appears geographically",
  "humor-forward product that is still useful — memorable and sticky",
  "anti-product: a kill-switch or constraint tool that stops overbuilding",
] as const;

/** Hard product domains — rotate so concepts cannot collapse to renames. */
export const CONCEPT_DOMAINS = [
  "speech rehearsal / delivery coaching with live chips",
  "document authenticity / forgery spotting on uploads",
  "field ops triage map for a named emergency role",
  "inbox triage that drafts one irreversible action with undo",
  "budget allocator that commits money in one click with a receipt",
  "peer matching for a scarce resource with one dramatic match",
  "offline-first field form that syncs one critical packet",
  "privacy kill-switch that blocks a share before it leaves the device",
  "rubric grader that marks a submitted artifact live on stage",
  "consequence simulator: choose A/B and watch the timeline fork",
  "spatial finder: pin a problem on a map and route the fix",
  "creator clip cutter that finds the one usable 8-second moment",
  "consent vault for sharing personal data with timed expiry",
  "queue fairness tool for walk-up services with a public board",
  "repair guide that overlays steps on a phone camera view",
] as const;

export function pickCreativeLens(seed: number, excludeIdeas: string[] = []): string {
  const pool = [...CREATIVE_LENSES];
  const start = Math.abs(seed) % pool.length;
  const rotated = [...pool.slice(start), ...pool.slice(0, start)];

  const excluded = excludeIdeas.map((t) => t.toLowerCase()).join(" ");
  const preferred = rotated.find((lens) => {
    const key = lens.split(" ")[0]?.toLowerCase() || "";
    return key && !excluded.includes(key);
  });
  return preferred || rotated[0];
}

export function pickConceptDomain(
  seed: number,
  bannedText: string[] = [],
): string {
  const banned = bannedText.join(" ").toLowerCase();
  const start = Math.abs(seed) % CONCEPT_DOMAINS.length;
  const rotated = [
    ...CONCEPT_DOMAINS.slice(start),
    ...CONCEPT_DOMAINS.slice(0, start),
  ];
  const preferred = rotated.find((d) => {
    const keys = d.split(/[\/,]/)[0]?.trim().toLowerCase() || "";
    return keys.length > 3 && !banned.includes(keys.slice(0, 12));
  });
  return preferred || rotated[0]!;
}

export function freshnessSeed(): number {
  return Date.now() ^ (Math.floor(Math.random() * 1_000_000) << 3);
}

/**
 * Strip hackathon stubs + trailing codes from product titles.
 * e.g. "NorthGateVsha42" / "PulseForgeTree7" → clean brand name.
 */
export function sanitizeProductTitle(title: string, hackathonName = ""): string {
  let t = title.trim();
  if (!t) return t;

  const letters = hackathonName.replace(/[^a-zA-Z]/g, "").toLowerCase();

  // …Vsha42 / …vsha42 — stub matching hackathon prefix + digits
  const coded = t.match(/^(.*?)([A-Za-z]{3,6})(\d+)$/);
  if (coded) {
    const [, base, frag] = coded;
    if (letters.length >= 3 && letters.startsWith(frag.toLowerCase())) {
      t = base.trim();
    } else {
      // Still drop trailing numbers from brand names
      t = `${base}${frag}`.trim();
    }
  } else {
    // Bare trailing digits: SeedWire42
    t = t.replace(/\d+$/, "").trim();
  }

  // Glue stub without digits: NorthGateVsha
  if (letters.length >= 4) {
    for (let len = Math.min(5, letters.length); len >= 4; len--) {
      const frag = letters.slice(0, len);
      const lower = t.toLowerCase();
      if (lower.endsWith(frag) && t.length > frag.length + 3) {
        t = t.slice(0, -frag.length).trim();
        break;
      }
    }
  }

  return t || title.replace(/\d+$/, "").trim() || title;
}
