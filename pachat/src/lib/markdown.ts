// A small, dependency-free Markdown renderer covering the subset the Pachat UI
// advertises: bold, italic, strikethrough, inline code, fenced code, headings,
// links, ordered/unordered lists, blockquotes, horizontal rules and tables.
// Everything is HTML-escaped first, so agent-supplied text can never inject markup.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeUrl(url: string): string {
  const trimmed = url.trim();
  if (/^(https?:|mailto:|\/|#)/i.test(trimmed)) return escapeHtml(trimmed);
  return "#";
}

function inline(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`);
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt, url) => {
    return `<img src="${safeUrl(url)}" alt="${alt}" />`;
  });
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, url) => {
    return `<a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  return out;
}

function renderTable(rows: string[][]): string {
  const [head, ...body] = rows;
  const thead = `<thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${body
    .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody>`;
  return `<table>${thead}${tbody}</table>`;
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.trim());
}

export function renderMarkdown(input: string): string {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      const lang = fence[1];
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // closing fence
      html.push(
        `<pre><code${lang ? ` class="language-${escapeHtml(lang)}"` : ""}>${escapeHtml(
          buf.join("\n"),
        )}</code></pre>`,
      );
      continue;
    }

    // Table
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:-]+\|/.test(lines[i + 1])) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        const cells = splitRow(lines[i]);
        if (!/^[\s:-]+$/.test(cells.join(""))) rows.push(cells);
        i++;
      }
      if (rows.length) html.push(renderTable(rows));
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      html.push("<hr />");
      i++;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      html.push(`<blockquote>${renderMarkdown(buf.join("\n"))}</blockquote>`);
      continue;
    }

    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    if (ul) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\s*[-*+]\s+(.*)$/);
        if (!m) break;
        items.push(`<li>${inline(m[1])}</li>`);
        i++;
      }
      html.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ol) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\s*\d+[.)]\s+(.*)$/);
        if (!m) break;
        items.push(`<li>${inline(m[1])}</li>`);
        i++;
      }
      html.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    // Paragraph
    const para: string[] = [];
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^(#{1,6})\s/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^\s*[-*+]\s/.test(lines[i]) &&
      !/^\s*\d+[.)]\s/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    html.push(`<p>${para.map(inline).join("<br />")}</p>`);
  }

  return html.join("\n");
}
