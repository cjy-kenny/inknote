export function countWords(text: string): number {
  const cjk = text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
  const latin = text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0;
  return cjk + latin;
}

export function stripMarkdown(text: string): string {
  return text
    .replace(/^---[\s\S]*?---\s*/m, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}(?:[-*+]|\d+\.)\s+\[[ xX]\]\s*/gm, "")
    .replace(/^\s{0,3}(?:[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_~]{1,3}/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function excerptOf(text: string, length = 120): string {
  const clean = stripMarkdown(text);
  return clean.length > length ? `${clean.slice(0, length)}…` : clean;
}

export function firstHeading(text: string): string | null {
  const match = text.match(/^\s{0,3}#{1,3}\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function highlightMatches(text: string, query: string): string {
  if (!query.trim()) return escapeHtml(text);
  const terms = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!terms.length) return escapeHtml(text);
  const pattern = new RegExp(`(${terms.join("|")})`, "gi");
  return escapeHtml(text).replace(pattern, "<mark>$1</mark>");
}

export function fuzzyScore(text: string, query: string): number | null {
  if (!query.trim()) return 0;
  const haystack = text.toLocaleLowerCase();
  const needle = query.toLocaleLowerCase().trim();
  const direct = haystack.indexOf(needle);
  if (direct >= 0) return 1000 - direct;
  let score = 0;
  let cursor = 0;
  for (const char of needle) {
    const found = haystack.indexOf(char, cursor);
    if (found < 0) return null;
    score += 10 - Math.min(9, found - cursor);
    cursor = found + 1;
  }
  return score;
}

export function cleanSnippet(html: string): string {
  return html
    .split(/(<\/?mark>)/i)
    .map((part) => {
      if (/^<\/?mark>$/i.test(part)) return part;
      return part
        .replace(/^\s{0,3}#{1,6}\s+/gm, "")
        .replace(/^\s{0,3}>\s?/gm, "")
        .replace(/^\s{0,3}(?:[-*+]|\d+\.)\s+\[[ xX]\]\s*/gm, "")
        .replace(/^\s{0,3}(?:[-*+]|\d+\.)\s+/gm, "")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/(\*\*|__|~~|`)/g, "");
    })
    .join("");
}

export function plainPreview(markdown: string, limit = 220): string {
  return excerptOf(markdown, limit);
}
