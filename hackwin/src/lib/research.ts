import { z } from "zod";
import { chatJson, getOpenAI } from "@/lib/openai";
import { scrapePage, type ScrapedPage } from "@/lib/scrape";
import { webSearch, type SearchHit } from "@/lib/search";
import type { ResearchDossier, ResearchSource } from "@/types/strategy";

const dossierSchema = z.object({
  resolvedName: z.string(),
  theme: z.string().default(""),
  judgingCriteria: z.array(z.string()).default([]),
  sponsors: z
    .array(
      z.object({
        name: z.string(),
        prizeTrack: z.string().default(""),
        prizeDetails: z.string().default(""),
        techOrApi: z.string().default(""),
      }),
    )
    .default([]),
  pastWinners: z
    .array(
      z.object({
        year: z.string().default(""),
        project: z.string(),
        description: z.string().default(""),
        track: z.string().default(""),
        whyItWon: z.string().default(""),
      }),
    )
    .default([]),
  notableProjects: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().default(""),
        url: z.string().default(""),
      }),
    )
    .default([]),
  gaps: z.array(z.string()).default([]),
});

const RELEVANT_LINK =
  /prize|sponsor|judg|award|winner|gallery|project|track|challenge|rule|faq|about|schedule|resource|previous|past|202[0-9]|201[0-9]/i;

export async function researchHackathon(input: {
  name: string;
  url?: string;
  theme?: string;
  sponsors?: string;
  pastWinners?: string;
}): Promise<ResearchDossier> {
  const name = input.name.trim();
  const url = input.url?.trim();

  const pages: ScrapedPage[] = [];
  const searchHits: SearchHit[] = [];
  const sources: ResearchSource[] = [];
  const galleryWinners: ResearchDossier["pastWinners"] = [];

  async function ingestPage(
    page: ScrapedPage | null,
    kind?: ResearchSource["kind"],
  ) {
    if (!page || page.text.length < 80) return;
    if (
      /secure\.devpost\.com|users\/register|\/login|bing\.com\/ck\/|info\.devpost\.com/i.test(
        page.url,
      )
    )
      return;
    if (pages.some((p) => p.url === page.url)) return;
    pages.push(page);
    sources.push({
      url: page.url,
      title: page.title || page.url,
      kind: kind || classifySource(page.url, page.title),
    });
  }

  // 0) Resolve hackathon homes: search-first (works for any name), then slug guesses
  const discovered = await resolveHackathonHomes(name, url);
  for (const discoveredUrl of discovered) {
    const main = await scrapePage(discoveredUrl);
    await ingestPage(main, "page");
    if (!main) continue;

    for (const follow of [
      ...pickFollowUrls(main, discoveredUrl),
      ...guessDevpostUrls(discoveredUrl),
    ]) {
      if (pages.some((p) => p.url === follow)) continue;
      const page = await scrapePage(follow);
      await ingestPage(page);
    }

    // Hard pull of winners from project galleries
    const year = (discoveredUrl.match(/20\d{2}/) || [""])[0];
    const winners = await extractDevpostGalleryWinners(discoveredUrl, year);
    for (const w of winners) {
      if (
        galleryWinners.some(
          (g) => g.project.toLowerCase() === w.project.toLowerCase(),
        )
      )
        continue;
      galleryWinners.push(w);
    }
  }

  // 1) Scrape primary URL if provided and not already covered
  if (url && !pages.some((p) => p.url.replace(/\/$/, "") === url.replace(/\/$/, ""))) {
    const main = await scrapePage(url);
    await ingestPage(main, "page");
    if (main) {
      const followUrls = pickFollowUrls(main, url);
      const followed = await Promise.all(followUrls.map((u) => scrapePage(u)));
      for (const page of followed) await ingestPage(page);
      for (const guess of guessDevpostUrls(url)) {
        if (pages.some((p) => p.url === guess)) continue;
        await ingestPage(await scrapePage(guess));
      }
      const year = (url.match(/20\d{2}/) || [""])[0];
      for (const w of await extractDevpostGalleryWinners(url, year)) {
        if (
          galleryWinners.some(
            (g) => g.project.toLowerCase() === w.project.toLowerCase(),
          )
        )
          continue;
        galleryWinners.push(w);
      }
    }
  }

  // 2) Web search — especially "{name} {year} winners" for past years
  const queries = buildSearchQueries(name, url);
  const searchBatches = await Promise.all(
    queries.map((q) => webSearch(q, 8)),
  );
  for (const batch of searchBatches) {
    for (const hit of batch) {
      if (searchHits.some((h) => h.url === hit.url)) continue;
      searchHits.push(hit);
      sources.push({
        url: hit.url,
        title: hit.title,
        kind: classifySource(hit.url, hit.title),
        snippet: hit.snippet,
      });
    }
  }

  // 2b) If search found more Devpost hackathon hubs, scrape those editions too
  const extraDevpost = searchHits
    .map((h) => h.url)
    .filter((u) => /\.devpost\.com/i.test(u))
    .map((u) => {
      try {
        return new URL(u).origin + "/";
      } catch {
        return "";
      }
    })
    .filter(Boolean);

  for (const origin of [...new Set(extraDevpost)].slice(0, 4)) {
    if (pages.some((p) => p.url.startsWith(origin))) continue;
    const main = await scrapePage(origin);
    await ingestPage(main, "page");
    if (!main) continue;
    for (const guess of guessDevpostUrls(origin)) {
      await ingestPage(await scrapePage(guess));
    }
    const year = (origin.match(/20\d{2}/) || [""])[0];
    for (const w of await extractDevpostGalleryWinners(origin, year)) {
      if (
        galleryWinners.some(
          (g) => g.project.toLowerCase() === w.project.toLowerCase(),
        )
      )
        continue;
      galleryWinners.push(w);
    }
  }

  // 3) Scrape top search results that look like winner/gallery/prize pages
  const scrapeCandidates = searchHits
    .filter((h) => RELEVANT_LINK.test(h.url + " " + h.title) || /winner/i.test(h.title))
    .slice(0, 10)
    .map((h) => h.url)
    .filter((u) => !pages.some((p) => p.url === u));

  const extraPages = await Promise.all(
    scrapeCandidates.map((u) => scrapePage(u)),
  );
  for (const page of extraPages) await ingestPage(page);

  // 3b) Pull software/project links from gallery-like pages
  const galleryProjects = extractGalleryProjects(pages);
  for (const project of galleryProjects.slice(0, 6)) {
    if (pages.some((p) => p.url === project.url)) continue;
    const page = await scrapePage(project.url);
    await ingestPage(page, "gallery");
  }

  // 4) Structure the dossier
  const rawBundle = buildRawBundle(name, url, pages, searchHits, input);

  let dossier: ResearchDossier;
  if (getOpenAI()) {
    dossier = await extractWithLlm(rawBundle, name);
  } else {
    dossier = extractHeuristically(name, url, pages, searchHits, input);
  }

  // Merge user overrides on top of discovery
  if (input.theme?.trim()) {
    dossier.theme = input.theme.trim();
  }
  if (input.sponsors?.trim()) {
    dossier.sponsors = mergeSponsorOverride(dossier.sponsors, input.sponsors);
  }
  if (input.pastWinners?.trim()) {
    dossier.pastWinners = mergeWinnerOverride(
      dossier.pastWinners,
      input.pastWinners,
    );
  }

  // Prefer hard-extracted gallery winners
  for (const w of galleryWinners) {
    if (
      dossier.pastWinners.some(
        (x) => x.project.toLowerCase() === w.project.toLowerCase(),
      )
    )
      continue;
    dossier.pastWinners.unshift(w);
  }

  if (galleryProjects.length && !dossier.notableProjects.length) {
    dossier.notableProjects = galleryProjects.slice(0, 8).map((p) => ({
      name: p.name.replace(/\s*Winner.*$/i, "").trim() || p.name,
      description: /winner/i.test(p.name)
        ? "Winner — from project gallery"
        : "From project gallery",
      url: p.url,
    }));
  }

  dossier.pastWinners = dossier.pastWinners
    .filter((w) => isPlausibleProjectName(w.project))
    .slice(0, 15);
  dossier.sponsors = finalizeSponsors(dossier.sponsors);
  dossier.sources = dedupeSources(sources).slice(0, 30);
  dossier.rawNotes = rawBundle.slice(0, 4000);

  // Recompute gaps from final dossier (after gallery winner merge)
  dossier.gaps = dossier.gaps.filter(
    (g) =>
      !/sponsors|winners|past winners|Devpost URL|structured data/i.test(g),
  );
  if (!dossier.sponsors.length) {
    dossier.gaps.push(
      "No sponsors found after deep search — try adding the Devpost URL",
    );
  }
  if (!dossier.pastWinners.length) {
    dossier.gaps.push("No past winners found after year-by-year search");
  }

  return dossier;
}

/** Find official hackathon pages for ANY name via search + Devpost slug probing. */
async function resolveHackathonHomes(
  name: string,
  url?: string,
): Promise<string[]> {
  const homes = new Set<string>();
  if (url) homes.add(normalizeHome(url));

  const label = name || (url ? hostLabel(url) : "");
  if (!label) return [...homes].filter(Boolean);

  // 1) Search-first: find real Devpost / official pages for this hackathon
  const discoveryQueries = [
    `${label} hackathon site:devpost.com`,
    `"${label}" hackathon site:devpost.com`,
    `${label} hackathon sponsors prizes`,
    `${label} hackathon official`,
  ];
  const discoveryHits = (
    await Promise.all(discoveryQueries.map((q) => webSearch(q, 8)))
  ).flat();

  for (const hit of discoveryHits) {
    const home = extractHackathonHome(hit.url);
    if (home) homes.add(home);
  }

  // Expand each found Devpost host into nearby year editions
  const year = new Date().getFullYear();
  const years = [year + 1, year, year - 1, year - 2, year - 3, year - 4];
  for (const home of [...homes]) {
    try {
      const host = new URL(home).hostname;
      if (!host.endsWith(".devpost.com")) continue;
      const base = host.replace(/\.devpost\.com$/i, "");
      const baseSlug = base.replace(/-?20\d{2}$/i, "").replace(/20\d{2}$/i, "");
      if (!baseSlug) continue;
      for (const y of years) {
        homes.add(`https://${baseSlug}-${y}.devpost.com/`);
        homes.add(`https://${baseSlug}${y}.devpost.com/`);
      }
      homes.add(`https://${baseSlug}.devpost.com/`);
    } catch {
      // skip
    }
  }

  // 2) Always add slug guesses too — search alone misses many Devpost hosts
  for (const guess of guessDevpostCandidates(label)) homes.add(guess);

  // Probe which URLs actually exist
  const candidates = [...homes].filter(Boolean);
  const probes = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        const res = await fetch(candidate, {
          method: "GET",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; HackWinBot/1.0; research)",
            Accept: "text/html",
          },
          signal: AbortSignal.timeout(8000),
          redirect: "follow",
        });
        if (!res.ok) return null;
        const finalUrl = normalizeHome(res.url || candidate);
        if (/^https:\/\/(www\.)?devpost\.com\/$/i.test(finalUrl)) return null;
        // Must look like a hackathon page, not a random software project
        if (/devpost\.com\/software\//i.test(finalUrl)) return null;
        return finalUrl;
      } catch {
        return null;
      }
    }),
  );

  const live = [...new Set(probes.filter(Boolean) as string[])];
  live.sort((a, b) => {
    const score = (u: string) => {
      let s = 0;
      if (/\.devpost\.com/i.test(u)) s += 10;
      s += Number((u.match(/20\d{2}/) || ["0"])[0]);
      return s;
    };
    return score(b) - score(a);
  });
  return live.slice(0, 8);
}

function normalizeHome(url: string): string {
  try {
    const u = new URL(url);
    // Keep Devpost hackathon subdomain roots
    if (u.hostname.endsWith(".devpost.com") && u.hostname !== "www.devpost.com") {
      return `${u.protocol}//${u.hostname}/`;
    }
    return u.href.replace(/\/$/, "") + "/";
  } catch {
    return url;
  }
}

function extractHackathonHome(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith(".devpost.com") && u.hostname !== "www.devpost.com") {
      if (u.hostname === "secure.devpost.com") return null;
      return `https://${u.hostname}/`;
    }
    // Official marketing sites sometimes appear in search — keep them too
    if (
      /hackathon|hacks|hack\b/i.test(u.hostname + u.pathname) &&
      !/wikipedia|reddit|twitter|linkedin|facebook|youtube/i.test(u.hostname)
    ) {
      return `${u.protocol}//${u.hostname}/`;
    }
    return null;
  } catch {
    return null;
  }
}

function guessDevpostCandidates(name: string): string[] {
  const year = new Date().getFullYear();
  const years = [year + 1, year, year - 1, year - 2, year - 3];
  const slugs = slugVariants(name).slice(0, 4);
  const out: string[] = [];
  for (const slug of slugs) {
    out.push(`https://${slug}.devpost.com/`);
    for (const y of years) {
      out.push(`https://${slug}-${y}.devpost.com/`);
      out.push(`https://${slug}${y}.devpost.com/`);
    }
  }
  return out;
}

function slugVariants(name: string): string[] {
  const base = name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-?(20\d{2}|19\d{2})$/g, "")
    .replace(/^-+|-+$/g, "");
  if (!base) return [];

  const variants = new Set<string>([base, base.replace(/-/g, "")]);

  const tokens = base.split("-").filter(Boolean);
  if (tokens.length > 1) {
    variants.add(tokens.join(""));
    const core = tokens.filter(
      (t) => !["the", "a", "an", "of", "and", "for", "at"].includes(t),
    );
    if (core.length) {
      variants.add(core.join("-"));
      variants.add(core.join(""));
    }
  }

  return [...variants].filter((s) => s.length >= 3);
}

function slugifyHackathonName(name: string): string {
  return slugVariants(name)[0] || "";
}

async function extractDevpostGalleryWinners(
  hackathonUrl: string,
  year = "",
): Promise<ResearchDossier["pastWinners"]> {
  try {
    const origin = new URL(hackathonUrl).origin;
    const galleryUrls = [
      `${origin}/project-gallery`,
      `${origin}/project-gallery?winning=true`,
    ];
    const winners: ResearchDossier["pastWinners"] = [];
    const seen = new Set<string>();

    for (const galleryUrl of galleryUrls) {
      const res = await fetch(galleryUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; HackWinBot/1.0; research)",
          Accept: "text/html",
        },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) continue;
      const html = await res.text();

      // Full gallery card — works for both modern and older Devpost markup
      const itemRe =
        /class="[^"]*gallery-item[^"]*"[\s\S]*?(?=<div class="[^"]*gallery-item|<\/div>\s*<\/div>\s*<\/div>\s*<div class="row"|$)/gi;
      let match: RegExpExecArray | null;
      while ((match = itemRe.exec(html)) !== null) {
        const block = match[0].slice(0, 5000);
        if (!/alt="Winner"|entry-badge[\s\S]{0,80}Winner/i.test(block)) continue;

        const project = extractGalleryProjectTitle(block);
        if (!isPlausibleProjectName(project)) continue;
        const key = project.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        const projectUrl =
          block.match(/href="(https:\/\/devpost\.com\/software\/[^"]+)"/i)?.[1] ||
          "";
        winners.push({
          year,
          project,
          description: projectUrl
            ? `Winner — ${projectUrl}`
            : `Winner on ${origin.replace("https://", "")}`,
          track: "",
          whyItWon: "",
        });
        if (winners.length >= 12) return winners;
      }

      // Fallback: software link near Winner badge
      if (!winners.length) {
        const re =
          /href="(https:\/\/devpost\.com\/software\/[^"]+)"([^>]*)>([\s\S]{0,4000}?alt="Winner"|alt="Winner"[\s\S]{0,4000}?href="https:\/\/devpost\.com\/software\/[^"]+")/gi;
        // Simpler fallback: title attr + winner nearby
        const loose =
          /title="([^"]+)"[^>]*href="(https:\/\/devpost\.com\/software\/[^"]+)"[\s\S]{0,2000}?alt="Winner"|href="(https:\/\/devpost\.com\/software\/[^"]+)"[^>]*title="([^"]+)"[\s\S]{0,2000}?alt="Winner"|alt="Winner"[\s\S]{0,2000}?title="([^"]+)"[^>]*href="(https:\/\/devpost\.com\/software\/[^"]+)"/gi;
        while ((match = loose.exec(html)) !== null) {
          const project = (match[1] || match[4] || match[5] || "").trim();
          if (!isPlausibleProjectName(project)) continue;
          const key = project.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          winners.push({
            year,
            project,
            description: `Winner — ${match[2] || match[3] || match[6] || ""}`,
            track: "",
            whyItWon: "",
          });
          if (winners.length >= 12) break;
        }
      }
    }
    return winners;
  } catch {
    return [];
  }
}

function extractGalleryProjectTitle(block: string): string {
  const candidates = [
    // Modern Devpost: h5 project name
    block.match(/<h5[^>]*>\s*([\s\S]*?)\s*<\/h5>/i)?.[1],
    // title= on the software project link only
    block.match(
      /title="([^"]+)"[^>]*href="https:\/\/devpost\.com\/software\/[^"]+"|href="https:\/\/devpost\.com\/software\/[^"]+"[^>]*title="([^"]+)"/i,
    )?.[1] ||
      block.match(
        /title="([^"]+)"[^>]*href="https:\/\/devpost\.com\/software\/[^"]+"|href="https:\/\/devpost\.com\/software\/[^"]+"[^>]*title="([^"]+)"/i,
      )?.[2],
    // Thumbnail alt (not the Winner ribbon)
    block.match(
      /class="[^"]*software_thumbnail_image[^"]*"[^>]*alt="([^"]+)"|alt="([^"]+)"[^>]*class="[^"]*software_thumbnail_image[^"]*"/i,
    )?.[1] ||
      block.match(
        /class="[^"]*software_thumbnail_image[^"]*"[^>]*alt="([^"]+)"|alt="([^"]+)"[^>]*class="[^"]*software_thumbnail_image[^"]*"/i,
      )?.[2],
    block.match(/<h[34][^>]*>\s*([\s\S]*?)\s*<\/h[34]>/i)?.[1],
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    const project = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!project || /^winner$/i.test(project)) continue;
    // Skip usernames / handles
    if (/^[a-z0-9_-]{2,24}$/i.test(project) && !/\s/.test(project)) {
      // allow brand-like single tokens only if they have mixed case with a vowel pattern... 
      // safer: reject lowercase-only handles and digit-heavy handles
      if (/[0-9]/.test(project) || project === project.toLowerCase()) continue;
    }
    return project;
  }
  return "";
}

function buildSearchQueries(name: string, url?: string): string[] {
  const label = name || (url ? hostLabel(url) : "");
  if (!label) return [];

  const year = new Date().getFullYear();
  const years = [year, year - 1, year - 2, year - 3];
  const queries = [
    `${label} hackathon sponsors prize tracks`,
    `${label} hackathon prizes judging criteria`,
    `${label} previous winners projects gallery`,
  ];

  // Year-by-year winner searches — works for any hackathon name
  for (const y of years) {
    queries.push(`${label} ${y} winners`);
    queries.push(`${label} hackathon ${y} winners`);
  }

  return queries;
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").split(".")[0] || "";
  } catch {
    return "";
  }
}

function pickFollowUrls(page: ScrapedPage, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const scored = page.links
    .map((link) => {
      let score = 0;
      const blob = `${link.href} ${link.text}`.toLowerCase();
      if (RELEVANT_LINK.test(blob)) score += 3;
      if (/prize|sponsor|winner|gallery|judg/.test(blob)) score += 3;
      try {
        const u = new URL(link.href);
        if (u.hostname === base.hostname) score += 2;
        if (u.hostname.includes("devpost.com")) score += 2;
      } catch {
        return { href: link.href, score: 0 };
      }
      return { href: link.href, score };
    })
    .filter((l) => l.score >= 3)
    .sort((a, b) => b.score - a.score);

  const unique: string[] = [];
  for (const item of scored) {
    if (unique.includes(item.href)) continue;
    if (item.href === baseUrl) continue;
    unique.push(item.href);
    if (unique.length >= 6) break;
  }
  return unique;
}

function guessDevpostUrls(url: string): string[] {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("devpost.com")) return [];
    const origin = u.origin;
    return [
      `${origin}/`,
      `${origin}/project-gallery`,
      `${origin}/details/judging`,
      `${origin}/details/prizes`,
      `${origin}/rules`,
      // Common winners destinations
      `${origin}/project-gallery?winning=true`,
    ];
  } catch {
    return [];
  }
}

function classifySource(
  url: string,
  title: string,
): ResearchSource["kind"] {
  const blob = `${url} ${title}`.toLowerCase();
  if (/winner|winning|grand prize|1st|first place/.test(blob)) return "winners";
  if (/gallery|project/.test(blob)) return "gallery";
  if (/prize|sponsor|track|award/.test(blob)) return "prizes";
  if (/search|duckduckgo/.test(blob)) return "search";
  return "page";
}

function buildRawBundle(
  name: string,
  url: string | undefined,
  pages: ScrapedPage[],
  hits: SearchHit[],
  input: { theme?: string; sponsors?: string; pastWinners?: string },
): string {
  const parts: string[] = [
    `HACKATHON NAME INPUT: ${name || "(unknown)"}`,
    `PRIMARY URL: ${url || "(none)"}`,
  ];

  if (input.theme) parts.push(`USER THEME NOTES:\n${input.theme}`);
  if (input.sponsors) parts.push(`USER SPONSOR NOTES:\n${input.sponsors}`);
  if (input.pastWinners) parts.push(`USER WINNER NOTES:\n${input.pastWinners}`);

  for (const page of pages.slice(0, 8)) {
    parts.push(
      `\n--- PAGE: ${page.title} (${page.url}) ---\n${page.text.slice(0, 6000)}`,
    );
  }

  if (hits.length) {
    parts.push("\n--- WEB SEARCH HITS ---");
    for (const hit of hits.slice(0, 16)) {
      parts.push(`• ${hit.title}\n  ${hit.url}\n  ${hit.snippet}`);
    }
  }

  return parts.join("\n");
}

async function extractWithLlm(
  rawBundle: string,
  fallbackName: string,
): Promise<ResearchDossier> {
  const system = `You are a research analyst extracting structured hackathon intelligence.
From the scraped pages and search hits, extract ONLY facts that are supported by the evidence.
If something is missing, leave it empty and list it in gaps — do not invent sponsors or winners.
Return JSON only.`;

  const user = `Extract a research dossier JSON with this shape:
{
  "resolvedName": string,
  "theme": string,
  "judgingCriteria": string[],
  "sponsors": [{ "name": string, "prizeTrack": string, "prizeDetails": string, "techOrApi": string }],
  "pastWinners": [{ "year": string, "project": string, "description": string, "track": string, "whyItWon": string }],
  "notableProjects": [{ "name": string, "description": string, "url": string }],
  "gaps": string[]
}

EVIDENCE:
${rawBundle.slice(0, 28000)}`;

  const raw = await chatJson(system, user);
  const parsed = dossierSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    return {
      resolvedName: fallbackName || "Unknown hackathon",
      theme: "",
      judgingCriteria: [],
      sponsors: [],
      pastWinners: [],
      notableProjects: [],
      gaps: ["LLM extraction failed — using raw evidence only"],
      sources: [],
    };
  }

  return {
    ...parsed.data,
    resolvedName: parsed.data.resolvedName || fallbackName || "Unknown hackathon",
    sources: [],
  };
}

function extractHeuristically(
  name: string,
  url: string | undefined,
  pages: ScrapedPage[],
  hits: SearchHit[],
  input: { theme?: string; sponsors?: string; pastWinners?: string },
): ResearchDossier {
  const corpus = [
    ...pages.map((p) => p.text),
    ...hits.map((h) => `${h.title}. ${h.snippet}`),
  ].join("\n");

  const sponsors = [
    ...extractDevpostSponsors(corpus),
    ...findSponsors(corpus),
  ]
    .map((s) => ({ ...s, name: cleanSponsorName(s.name) }))
    .filter((s) => s.name.length >= 2)
    .filter(
      (s, i, arr) =>
        arr.findIndex((x) => x.name.toLowerCase() === s.name.toLowerCase()) === i,
    );

  const prizeTracks = extractDevpostPrizeTracks(corpus);
  // Attach prize tracks to known sponsors only — don't invent sponsors from track titles
  for (const track of prizeTracks) {
    const match = sponsors.find((s) =>
      track.toLowerCase().includes(s.name.toLowerCase()),
    );
    if (match && !match.prizeTrack) {
      match.prizeTrack = track;
      match.prizeDetails = track;
    }
  }

  // "Best Use of X" → sponsor X
  for (const track of prizeTracks) {
    const m = track.match(/best use of\s+(.+?)(?:\s*\(|$)/i);
    if (!m) continue;
    let name = m[1]
      .replace(/\s+\b(?:or|in|using|with|for)\b.*$/i, "")
      .replace(/^GenAI using\s+/i, "")
      .trim();
    name = cleanSponsorName(name);
    if (!isPlausibleSponsorName(name)) continue;
    if (sponsors.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      const existing = sponsors.find(
        (s) => s.name.toLowerCase() === name.toLowerCase(),
      )!;
      if (!existing.prizeTrack) existing.prizeTrack = track;
      continue;
    }
    sponsors.push({
      name,
      prizeTrack: track,
      prizeDetails: track,
      techOrApi: "",
    });
  }

  const galleryProjects = extractGalleryProjects(pages);
  const pastWinners = [
    ...extractDevpostWinners(corpus, hits),
    ...findWinners(corpus, hits),
  ].filter(
    (w, i, arr) =>
      arr.findIndex((x) => x.project.toLowerCase() === w.project.toLowerCase()) ===
      i,
  );

  const theme =
    input.theme?.trim() ||
    findTheme(corpus) ||
    pages[0]?.text.match(
      /(?:largest|annual|build|create|hack)[^\n.]{20,220}/i,
    )?.[0] ||
    "";

  const gaps: string[] = [];
  if (!sponsors.length) gaps.push("Could not confidently extract sponsors/prize tracks");
  if (!pastWinners.length) gaps.push("Could not confidently extract past winners");
  if (!theme) gaps.push("Theme/prompt text was thin — add a URL or theme notes");

  return {
    resolvedName:
      name || pages[0]?.title || hostLabel(url || "") || "Unknown hackathon",
    theme: theme.slice(0, 500),
    judgingCriteria: findJudging(corpus),
    sponsors: finalizeSponsors(sponsors),
    pastWinners: pastWinners
      .filter((w) => isPlausibleProjectName(w.project))
      .slice(0, 12),
    notableProjects: [
      ...galleryProjects.map((p) => ({
        name: p.name,
        description: "From project gallery",
        url: p.url,
      })),
      ...hits
        .filter((h) => /devpost\.com\/software|project/i.test(h.url))
        .map((h) => ({
          name: h.title,
          description: h.snippet,
          url: h.url,
        })),
    ]
      .filter((p, i, arr) => {
        if (!isPlausibleProjectName(p.name)) return false;
        return (
          arr.findIndex((x) => x.name.toLowerCase() === p.name.toLowerCase()) === i
        );
      })
      .slice(0, 8),
    gaps,
    sources: [],
  };
}

function extractDevpostSponsors(corpus: string): ResearchDossier["sponsors"] {
  const sponsors: ResearchDossier["sponsors"] = [];
  const seen = new Set<string>();

  const add = (
    rawName: string,
    track = "",
    details = "",
    opts?: { allowDomain?: boolean },
  ) => {
    const name = cleanSponsorName(rawName);
    if (!isPlausibleSponsorName(name, opts)) return;
    const key = name.toLowerCase();
    if (seen.has(key)) {
      const existing = sponsors.find((s) => s.name.toLowerCase() === key);
      if (existing && !existing.prizeTrack && track) {
        existing.prizeTrack = track;
        existing.prizeDetails = details || track;
      }
      return;
    }
    seen.add(key);
    sponsors.push({
      name,
      prizeTrack: track.slice(0, 140),
      prizeDetails: (details || track).slice(0, 220),
      techOrApi: "",
    });
  };

  let m: RegExpExecArray | null;

  // Universal sponsor attribution phrases
  const attribution: { re: RegExp; group: number }[] = [
    {
      re: /Sponsored by\s+([A-Z][\w.&+]*(?:\s+[A-Z0-9][\w.&+]*){0,4})\s*[.,]/g,
      group: 1,
    },
    {
      re: /Presented by\s+([A-Z][\w.&+]*(?:\s+[A-Z0-9][\w.&+]*){0,4})\s*[.,]/g,
      group: 1,
    },
    {
      re: /Powered by\s+([A-Z][\w.&+]*(?:\s+[A-Z0-9][\w.&+]*){0,3})\s*[.,]/g,
      group: 1,
    },
    {
      re: /In partnership with\s+([A-Z][\w.&+]*(?:\s+[A-Z0-9][\w.&+]*){0,4})\s*[.,]/g,
      group: 1,
    },
    {
      re: /Partner(?:ed)? with\s+([A-Z][\w.&+]*(?:\s+[A-Z0-9][\w.&+]*){0,4})\s*[.,]/g,
      group: 1,
    },
  ];

  for (const { re, group } of attribution) {
    while ((m = re.exec(corpus)) !== null) {
      const window = corpus
        .slice(m.index - 120, m.index + 200)
        .replace(/\s+/g, " ");
      const track =
        window.match(
          /(?:Best|Most|Grand)?[^.]{0,40}(?:Prize|Track|Challenge|Award)[^.]{0,60}/i,
        )?.[0] || "";
      add(m[group], track, window.slice(0, 200));
    }
  }

  // "Brand Sponsor Award" / "Brand Prize Track" — require Sponsor/Prize/Challenge keyword
  const brandedTrackRe =
    /(?:^|[\s|])([A-Z][A-Za-z0-9.&+]{1,24}(?:\.[a-z]{2,4})?)\s+Sponsor\s+Award\b/g;
  while ((m = brandedTrackRe.exec(corpus)) !== null) {
    add(
      m[1],
      `${m[1]} Sponsor Award`,
      corpus.slice(m.index, m.index + 140),
      { allowDomain: true },
    );
  }

  const prizeTrackBrandRe =
    /(?:^|[\s|])([A-Z][A-Za-z0-9.&+]{1,24}(?:\s+[A-Z][A-Za-z0-9.&+]{1,16}){0,2})\s+(?:Prize Track|Challenge)\b/g;
  while ((m = prizeTrackBrandRe.exec(corpus)) !== null) {
    const brand = m[1];
    if (
      /^(First|Runner|Grand|Most|Best|Theme|Audience|General|Overall|Online|Public|Beginner)$/i.test(
        brand,
      )
    )
      continue;
    add(brand, m[0].replace(/\s+/g, " ").trim().slice(0, 120), m[0]);
  }

  // "Best Use of X" / "Best use of the X API"
  const bestUseRe =
    /Best use of\s+(?:the\s+)?([A-Z][A-Za-z0-9.&+]*(?:\s+[A-Z][A-Za-z0-9.&+]*){0,3})(?:\s+API|\s+SDK|\s+platform)?/g;
  while ((m = bestUseRe.exec(corpus)) !== null) {
    let brand = m[1]
      .replace(/\s+\b(?:or|in|using|with|for|and)\b.*$/i, "")
      .trim();
    if (/^(API|SDK|AI|ML|the)$/i.test(brand)) continue;
    add(brand, m[0].slice(0, 120), m[0], { allowDomain: true });
  }

  // Perk lines that name a brand: "$25 Acme Coupon", "Acme Credits", "from Acme"
  const perkRes: { re: RegExp; group: number; allowDomain?: boolean }[] = [
    {
      re: /\$[\d,]+\s+([A-Z][A-Za-z0-9.&+]{1,24})\s+(?:Coupon|Gift\s*Card|Giftcard|Credits?)/g,
      group: 1,
    },
    {
      re: /\b((?:[A-Z][A-Za-z0-9.&+]+\s+){0,2}[A-Z][A-Za-z0-9.&+]+)\s+Subscription\b/g,
      group: 1,
    },
    {
      re: /(?:certificate|compliments|courtesy)\s+from\s+([A-Z][A-Za-z0-9.&+]{1,24})/gi,
      group: 1,
    },
    {
      re: /\.(xyz|io|ai|dev)\s+Domains?\b/gi,
      group: 1,
      allowDomain: true,
    },
    {
      re: /\$?[\d,]+\s+(?:in\s+)?([a-z0-9][\w-]{1,24}\.(?:ai|io|dev|xyz))\s+(?:tokens?|credits?)/gi,
      group: 1,
      allowDomain: true,
    },
  ];

  for (const { re, group, allowDomain } of perkRes) {
    while ((m = re.exec(corpus)) !== null) {
      let brand = m[group];
      if (/\s+Domains?/i.test(m[0]) && !brand.startsWith(".")) {
        brand = `.${brand}`;
      }
      // Skip bare product words unless clearly branded
      if (
        /^(Nitro|Premium|Family|Pro|Plus|Annual|Monthly|Credits?|Coupon|Domains|Stickers|Winners|Password)$/i.test(
          brand,
        )
      )
        continue;
      if (/\b(Domains|Stickers|Winners|Ended|About)\b/i.test(brand)) continue;
      add(brand, m[0].slice(0, 120), m[0], { allowDomain });
    }
  }

  return sponsors;
}

function extractDevpostPrizeTracks(corpus: string): string[] {
  const tracks: string[] = [];
  const seen = new Set<string>();
  const patterns = [
    /([A-Za-z][^|\n]{5,70}?)\s*\|\s*(?:1st Place|Grand Prize|Winner)[^\n]{0,40}\(\$[\d,]+[^)]*\)/gi,
    /((?:Web3|AI|Health|Fintech|Climate|Hardware|Social|Education|Open Source)?[^.\n]{0,40}Prize:[^\n]{5,90}\(\$[\d,]+[^)]*\))/gi,
    /(Best [A-Za-z0-9][^.\n]{3,70}\(\$[\d,]+[^)]*\))/gi,
    /(Most [A-Za-z][^.\n]{3,70}\(\$[\d,]+[^)]*\))/gi,
  ];

  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(corpus)) !== null) {
      const track = m[1].replace(/\s+/g, " ").trim();
      const key = track.toLowerCase();
      if (seen.has(key) || track.length < 8) continue;
      if (/the grand prize is awarded|celebrates the team|recognizes the project/i.test(track))
        continue;
      seen.add(key);
      tracks.push(track);
      if (tracks.length >= 20) return tracks;
    }
  }
  return tracks;
}

function extractDevpostWinners(
  corpus: string,
  hits: SearchHit[],
): ResearchDossier["pastWinners"] {
  const winners: ResearchDossier["pastWinners"] = [];
  const seen = new Set<string>();

  // "Winner: ProjectName" / "Winning project: X" / gallery-style titles
  const patterns = [
    /(?:winner|winning project|grand prize winner)\s*[:\-–—]\s*([A-Z][^\n.]{2,60})/gi,
    /([A-Z][A-Za-z0-9 .+\-]{2,40})\s+(?:won|takes?|took)\s+(?:the\s+)?(?:grand prize|1st|first place)/gi,
  ];

  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(corpus)) !== null) {
      const project = m[1].trim();
      if (!isPlausibleProjectName(project)) continue;
      const key = project.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      winners.push({
        year: (corpus.slice(Math.max(0, m.index - 40), m.index + 40).match(/20\d{2}/) || [
          "",
        ])[0],
        project,
        description: m[0].slice(0, 180),
        track: "",
        whyItWon: "",
      });
    }
  }

  for (const hit of hits) {
    if (!/winner|winning|grand prize|1st place/i.test(hit.title + " " + hit.snippet))
      continue;
    // Prefer software project pages
    const project = hit.title
      .replace(/\s*[|\-–—].*$/, "")
      .replace(/\s*·.*$/, "")
      .trim();
    if (!isPlausibleProjectName(project)) continue;
    const key = project.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    winners.push({
      year: (hit.title.match(/20\d{2}/) || hit.snippet.match(/20\d{2}/) || [""])[0],
      project,
      description: hit.snippet || hit.title,
      track: "",
      whyItWon: "",
    });
  }

  return winners;
}

function extractGalleryProjects(
  pages: ScrapedPage[],
): { name: string; url: string }[] {
  const out: { name: string; url: string }[] = [];
  const seen = new Set<string>();

  for (const page of pages) {
    for (const link of page.links) {
      if (!/devpost\.com\/software\//i.test(link.href)) continue;
      const name = link.text || link.href.split("/").pop() || "";
      if (!isPlausibleProjectName(name)) continue;
      if (seen.has(link.href)) continue;
      seen.add(link.href);
      out.push({ name, url: link.href });
      if (out.length >= 12) return out;
    }
  }
  return out;
}

function cleanSponsorName(raw: string): string {
  let name = raw.replace(/\s+/g, " ").trim();
  // Prefer the company token before a sentence continues ("Liquid AI. We're looking…")
  if (/\.\s+[A-Z]/.test(name) || (/\.$/.test(name) && !/^\./.test(name))) {
    name = name.split(".")[0] || name;
  }
  name = name
    .replace(/\s+\d+\s+winners?\b.*$/i, "")
    .replace(/\s+\d+\s+winner\b.*$/i, "")
    .replace(/\s+Pitch\b.*$/i, "")
    .replace(/[.,;:]+$/g, "")
    .replace(
      /\s+(We|We're|We’re|Technical|Boldness|Focus|Looking|Current|TSS|Prowess|Sponsor|Award).*$/i,
      "",
    )
    .replace(/^(first year|ended|about the|design about)\s+/i, "")
    .trim();
  return name;
}

function isPlausibleProjectName(name: string): boolean {
  if (name.length < 3 || name.length > 60) return false;
  if (/^(the|a|an)\s/i.test(name) && name.split(" ").length > 6) return false;
  if (
    /prize is awarded|celebrates the|recognizes the|looking for|sponsored by|cash|winners?$/i.test(
      name,
    )
  )
    return false;
  if (/^\$/.test(name)) return false;
  if (/winners and demos|hackathon 20\d{2} winners/i.test(name)) return false;
  if (
    /^(python|cuda|nvidia|groq|expo\.io|source|react|next|aws|gcp|azure|docker|github|api|pytorch|javascript|typescript|focus)$/i.test(
      name,
    )
  )
    return false;
  const parts = name.toLowerCase().split(/\s+/);
  if (parts.length === 2 && parts[0] === parts[1]) return false;
  if (/^\w{3}\s+\d{1,2},\s+20\d{2}/i.test(name)) return false;
  if (/^\d/.test(name)) return false;
  return true;
}

function isPlausibleSponsorName(
  name: string,
  opts?: { allowDomain?: boolean },
): boolean {
  if (name.length < 2 || name.length > 40) return false;
  if (
    /^(prize|track|award|winner|grand|best|most|the|and|or|in|of|using|gift|card|amazon|subscription|coupon|domains?|group|per|first|runner|theme|audience|overall|general|online|public|hackathon|sponsor|hack|ai|ml|api|sdk|healthcare|inference|design|ended|about)$/i.test(
      name,
    )
  )
    return false;
  // Reject theme/category phrases commonly mistaken for sponsors
  if (
    /^(artificial intelligence|human flourishing|mobile data|popular choice|api innovation|pin it)$/i.test(
      name,
    )
  )
    return false;
  if (/\b(prize|track|hackathon|about the|who want)\b/i.test(name))
    return false;
  if (/\b(or|in|using|with)\b/i.test(name)) return false;
  if (/^\d/.test(name)) return false;
  if (/^(of|use of)\b/i.test(name)) return false;

  // Domains only when extracted from an explicit sponsor/perk context
  if (/\.[a-z]{2,4}$/i.test(name) || name.startsWith(".")) {
    if (!opts?.allowDomain) return false;
    if (/^(github|itch|google|youtube|twitter|linkedin)\./i.test(name))
      return false;
  }

  return true;
}

function finalizeSponsors(
  sponsors: ResearchDossier["sponsors"],
): ResearchDossier["sponsors"] {
  const cleaned = sponsors
    .map((s) => ({
      ...s,
      name: cleanSponsorName(s.name),
      prizeTrack: (s.prizeTrack || "")
        .replace(/^[a-z0-9_#./-]{6,}\s+/i, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 140),
    }))
    .filter((s) =>
      isPlausibleSponsorName(s.name, {
        allowDomain: /\.|Sponsor|Award|Domain|token|credit|Subscription|Coupon/i.test(
          s.prizeTrack + s.prizeDetails,
        ),
      }),
    )
    .filter((s) => !/\.\s/.test(s.name));

  const byName = new Map<string, (typeof cleaned)[number]>();
  for (const s of cleaned) {
    const key = s.name.toLowerCase();
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, s);
      continue;
    }
    if (!existing.prizeTrack && s.prizeTrack) byName.set(key, s);
  }
  return [...byName.values()].slice(0, 15);
}

function findSponsors(corpus: string) {
  const sponsors: ResearchDossier["sponsors"] = [];
  const seen = new Set<string>();

  const patterns = [
    /(?:sponsored by|presented by|partner(?:ed)? with)\s+([A-Z][\w.&+]*(?:\s+[A-Z][\w.&+]*){0,3})/gi,
    /best use of\s+([A-Z][\w.&+]*(?:\s+[A-Z][\w.&+]*){0,2})/gi,
  ];

  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(corpus)) !== null) {
      const name = (m[1] || "").trim().replace(/\s+/g, " ");
      if (name.length < 2 || name.length > 40) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      if (/^(the|and|for|with|this|that|from|your|our|we)$/i.test(name)) continue;
      seen.add(key);
      sponsors.push({
        name,
        prizeTrack: /track|prize|challenge|best use/i.test(m[0])
          ? m[0].slice(0, 120)
          : "",
        prizeDetails: m[0].slice(0, 160),
        techOrApi: "",
      });
      if (sponsors.length >= 12) return sponsors;
    }
  }
  return sponsors;
}

function findWinners(corpus: string, hits: SearchHit[]) {
  const winners: ResearchDossier["pastWinners"] = [];
  const seen = new Set<string>();

  const re =
    /(?:winner|grand prize|1st place|first place)\s*[:\-–—]\s*([A-Z][^\n.]{2,60})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(corpus)) !== null) {
    const project = m[1].trim();
    if (!isPlausibleProjectName(project)) continue;
    const key = project.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    winners.push({
      year: "",
      project,
      description: m[0].slice(0, 200),
      track: "",
      whyItWon: "",
    });
    if (winners.length >= 8) break;
  }

  for (const hit of hits) {
    if (!/winner|winning|grand prize/i.test(hit.title + hit.snippet)) continue;
    const project = hit.title.replace(/\s*[|\-–—].*$/, "").trim();
    if (!isPlausibleProjectName(project)) continue;
    const key = project.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    winners.push({
      year: (hit.title.match(/20\d{2}/) || [""])[0],
      project,
      description: hit.snippet,
      track: "",
      whyItWon: "",
    });
    if (winners.length >= 10) break;
  }

  return winners;
}

function findTheme(corpus: string): string {
  const m = corpus.match(
    /(?:theme|this year(?:'s)? challenge|build\s+(?:for|with)|prompt)\s*[:\-]\s*([^\n]{20,280})/i,
  );
  return m?.[1]?.trim() || "";
}

function findJudging(corpus: string): string[] {
  const criteria: string[] = [];
  const re =
    /(?:judg(?:ing|ed)(?:\s+criteria)?|scored on|evaluated on)\s*[:\-]?\s*([^\n]{10,200})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(corpus)) !== null) {
    criteria.push(m[1].trim());
    if (criteria.length >= 5) break;
  }
  return criteria;
}

function mergeSponsorOverride(
  existing: ResearchDossier["sponsors"],
  text: string,
): ResearchDossier["sponsors"] {
  const lines = text
    .split(/\n|,/)
    .map((l) => l.trim())
    .filter(Boolean);
  const merged = [...existing];
  for (const line of lines) {
    const name = line.split(/[—–\-:|]/)[0]?.trim() || line;
    if (merged.some((s) => s.name.toLowerCase() === name.toLowerCase())) continue;
    merged.push({
      name,
      prizeTrack: line,
      prizeDetails: line,
      techOrApi: "",
    });
  }
  return merged;
}

function mergeWinnerOverride(
  existing: ResearchDossier["pastWinners"],
  text: string,
): ResearchDossier["pastWinners"] {
  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const merged = [...existing];
  for (const line of lines) {
    if (merged.some((w) => w.project.toLowerCase() === line.toLowerCase())) continue;
    merged.push({
      year: (line.match(/20\d{2}/) || [""])[0],
      project: line,
      description: line,
      track: "",
      whyItWon: "",
    });
  }
  return merged;
}

function dedupeSources(sources: ResearchSource[]): ResearchSource[] {
  const seen = new Set<string>();
  const out: ResearchSource[] = [];
  for (const s of sources) {
    if (seen.has(s.url)) continue;
    seen.add(s.url);
    out.push(s);
  }
  return out;
}
