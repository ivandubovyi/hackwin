export type SearchHit = {
  title: string;
  url: string;
  snippet: string;
};

/**
 * Multi-engine web search. DuckDuckGo HTML is often bot-blocked,
 * so we try Brave → Bing → DuckDuckGo.
 */
export async function webSearch(query: string, limit = 8): Promise<SearchHit[]> {
  const engines = [searchBrave, searchBing, searchDuckDuckGo];
  for (const engine of engines) {
    try {
      const hits = await engine(query, limit);
      if (hits.length) return hits;
    } catch {
      // try next engine
    }
  }
  return [];
}

async function searchBrave(query: string, limit: number): Promise<SearchHit[]> {
  const url = `https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`;
  const html = await fetchHtml(url);
  if (!html) return [];

  const hits: SearchHit[] = [];
  const seen = new Set<string>();

  const patterns = [
    /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*class="[^"]*snippet-title[^"]*"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="[^"]*snippet-description[^"]*"[^>]*>([\s\S]*?)<\/)/gi,
    /class="[^"]*snippet-title[^"]*"[^>]*>[\s\S]*?href="(https?:\/\/[^"]+)"[\s\S]*?>([\s\S]*?)<\/a>[\s\S]{0,400}?class="[^"]*snippet-description[^"]*"[^>]*>([\s\S]*?)<\//gi,
  ];

  for (const re of patterns) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(html)) !== null && hits.length < limit) {
      const href = cleanUrl(match[1]);
      if (!href || seen.has(href) || isNoiseUrl(href)) continue;
      seen.add(href);
      hits.push({
        title: stripTags(match[2]).slice(0, 200),
        url: href,
        snippet: stripTags(match[3] || "").slice(0, 400),
      });
    }
    if (hits.length) break;
  }

  return hits;
}

async function searchBing(query: string, limit: number): Promise<SearchHit[]> {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=en`;
  const html = await fetchHtml(url);
  if (!html) return [];

  const hits: SearchHit[] = [];
  const seen = new Set<string>();

  // Bing often wraps results; pull h2 anchors inside algo blocks when possible
  const blockRe =
    /class="b_algo"[\s\S]{0,2500}?<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]{0,800}?(?:<p[^>]*>|<div class="b_caption"[^>]*>)([\s\S]*?)(?:<\/p>|<\/div>)/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(html)) !== null && hits.length < limit) {
    const href = cleanUrl(unwrapBing(match[1]));
    if (!href || seen.has(href) || isNoiseUrl(href)) continue;
    seen.add(href);
    hits.push({
      title: stripTags(match[2]).slice(0, 200),
      url: href,
      snippet: stripTags(match[3] || "").slice(0, 400),
    });
  }

  if (hits.length) return hits;

  const looseRe = /<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  while ((match = looseRe.exec(html)) !== null && hits.length < limit) {
    const href = cleanUrl(unwrapBing(match[1]));
    if (!href || seen.has(href) || isNoiseUrl(href)) continue;
    if (!/http/i.test(href)) continue;
    seen.add(href);
    hits.push({
      title: stripTags(match[2]).slice(0, 200),
      url: href,
      snippet: "",
    });
  }

  return hits;
}

async function searchDuckDuckGo(query: string, limit: number): Promise<SearchHit[]> {
  const res = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "text/html",
    },
    body: `q=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return [];
  const html = await res.text();
  const hits: SearchHit[] = [];
  const re =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|td|div)>)?/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null && hits.length < limit) {
    const href = cleanUrl(unwrapDuckRedirect(match[1]));
    if (!href || isNoiseUrl(href)) continue;
    hits.push({
      title: stripTags(match[2]).slice(0, 200),
      url: href,
      snippet: stripTags(match[3] || "").slice(0, 400),
    });
  }
  return hits;
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(12000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function unwrapBing(href: string): string {
  try {
    if (href.includes("bing.com/ck/")) {
      const u = new URL(href, "https://www.bing.com");
      const uParam = u.searchParams.get("u");
      if (uParam) {
        // Bing encodes target as base64-ish after "a1"
        const raw = decodeURIComponent(uParam);
        const m = raw.match(/^a1(.+)$/);
        if (m) {
          try {
            return Buffer.from(m[1], "base64").toString("utf8");
          } catch {
            return href;
          }
        }
      }
    }
    return href;
  } catch {
    return href;
  }
}

function unwrapDuckRedirect(href: string): string {
  try {
    if (href.includes("uddg=")) {
      const u = new URL(href, "https://duckduckgo.com");
      const target = u.searchParams.get("uddg");
      if (target) return decodeURIComponent(target);
    }
    if (href.startsWith("//")) return `https:${href}`;
    if (href.startsWith("http")) return href;
    return new URL(href, "https://duckduckgo.com").href;
  } catch {
    return href;
  }
}

function cleanUrl(href: string): string {
  try {
    const u = new URL(href);
    if (!["http:", "https:"].includes(u.protocol)) return "";
    return u.href;
  } catch {
    return "";
  }
}

function isNoiseUrl(href: string): boolean {
  return /brave\.com\/search|bing\.com\/search|duckduckgo\.com|microsoft\.com\/en-us\/bing|login\.|accounts\./i.test(
    href,
  );
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
