/** Local-only preparation. This is not an execution or spending authorization. */
export interface ImageDraftItem { name: string; prompt: string }
export interface ImageDraftIssue { line: number; code: "format" | "name" | "duplicate" | "prompt" | "limit" | "size" }
export interface ImageDraftResult { items: ImageDraftItem[]; issues: ImageDraftIssue[]; batches: ImageDraftItem[][] }

export function parseImageDraft(source: string): ImageDraftResult {
  const items: ImageDraftItem[] = [];
  const issues: ImageDraftIssue[] = [];
  if (source.length > 200_000) return { items, issues: [{ line: 0, code: "size" }], batches: [] };
  const names = new Set<string>();
  const lines = source.split(/\r?\n/);
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    const row = lines[i].trim();
    if (!row) continue;
    if (++count > 100) { issues.push({ line: i + 1, code: "limit" }); break; }
    const separator = row.indexOf("|");
    if (separator < 0) { issues.push({ line: i + 1, code: "format" }); continue; }
    const name = row.slice(0, separator).trim();
    const prompt = row.slice(separator + 1).trim();
    // ASCII file stems remain predictable across Windows ZIP extraction tools.
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)) {
      issues.push({ line: i + 1, code: "name" }); continue;
    }
    if (names.has(name.toLowerCase())) { issues.push({ line: i + 1, code: "duplicate" }); continue; }
    names.add(name.toLowerCase());
    if (!prompt || prompt.length > 8000) { issues.push({ line: i + 1, code: "prompt" }); continue; }
    items.push({ name, prompt });
  }
  const batches: ImageDraftItem[][] = [];
  if (!issues.length) for (let i = 0; i < items.length; i += 10) batches.push(items.slice(i, i + 10));
  return { items, issues, batches };
}

export function imageDraftProject(value: string): string | null {
  const match = /^https:\/\/flow\.google\.com\/project\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\/?$/i.exec(value.trim());
  return match ? `https://flow.google.com/project/${match[1].toLowerCase()}` : null;
}
