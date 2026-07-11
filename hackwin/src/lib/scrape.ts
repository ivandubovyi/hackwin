export type ScrapedPage = {
  url: string;
  title: string;
  text: string;
  links: { href: string; text: string }[];
};

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (compatible; HackWinBot/1.0; +https://localhost; research)",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

export async function scrapePage(url: string): Promise<ScrapedPage | null> {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;

    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });
    if (!res.ok) return null;

    const html = await res.text();
    const finalUrl = res.url || url;
    return parseHtml(finalUrl, html);
  } catch {
    return null;
  }
}

/** @deprecated use scrapePage */
export async function scrapeHackathonPage(url: string): Promise<string | null> {
  const page = await scrapePage(url);
  return page?.text ?? null;
}

export function parseHtml(url: string, html: string): ScrapedPage {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = decodeEntities(titleMatch?.[1] || "").trim().slice(0, 200);

  const links = extractLinks(url, html);
  const text = htmlToText(html);

  return { url, title, text, links };
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+\n/g, "\n")
      .replace(/\n\s+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  ).slice(0, 20000);
}

function extractLinks(baseUrl: string, html: string): { href: string; text: string }[] {
  const links: { href: string; text: string }[] = [];
  const seen = new Set<string>();
  const re = /<a\s+[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = re.exec(html)) !== null) {
    try {
      const href = new URL(match[1], baseUrl).href;
      if (!href.startsWith("http")) continue;
      if (seen.has(href)) continue;
      seen.add(href);
      const text = decodeEntities(match[2].replace(/<[^>]+>/g, " "))
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);
      links.push({ href, text });
      if (links.length >= 80) break;
    } catch {
      // skip bad URLs
    }
  }

  return links;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
