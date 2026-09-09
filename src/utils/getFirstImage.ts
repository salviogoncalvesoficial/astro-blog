export function getFirstImage(body: string): string | null {
  if (!body) return null;
  // Formato markdown: ![alt](url)
  const md = body.match(/!\[[^\]]*\]\(([^)\s]+)/);
  if (md) return md[1];
  // Fallback para HTML: <img src="...">
  const html = body.match(/<img[^>]+src=["']([^"']+)["']/i);
  return html ? html[1] : null;
}
