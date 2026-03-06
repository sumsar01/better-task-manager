/**
 * Minimal Atlassian Document Format (ADF) → HTML converter.
 * Handles all common block and inline node types.
 * Unknown nodes fall back to rendering their children recursively.
 */

interface AdfMark {
  type: string;
  attrs?: Record<string, string | number | boolean | null>;
}

interface AdfNode {
  type: string;
  attrs?: Record<string, string | number | boolean | null>;
  content?: AdfNode[];
  marks?: AdfMark[];
  text?: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function applyMarks(text: string, marks: AdfMark[]): string {
  let result = text;
  for (const mark of marks) {
    switch (mark.type) {
      case "strong":
        result = `<strong>${result}</strong>`;
        break;
      case "em":
        result = `<em>${result}</em>`;
        break;
      case "underline":
        result = `<u>${result}</u>`;
        break;
      case "strike":
        result = `<s>${result}</s>`;
        break;
      case "code":
        result = `<code class="adf-inline-code">${result}</code>`;
        break;
      case "link": {
        const href = mark.attrs?.href ?? "#";
        const safeHref = escapeHtml(String(href));
        result = `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="adf-link">${result}</a>`;
        break;
      }
      case "textColor": {
        const color = mark.attrs?.color ?? "inherit";
        result = `<span style="color:${escapeHtml(String(color))}">${result}</span>`;
        break;
      }
      case "subsup": {
        const tag = mark.attrs?.type === "sub" ? "sub" : "sup";
        result = `<${tag}>${result}</${tag}>`;
        break;
      }
    }
  }
  return result;
}

function convertNode(node: AdfNode): string {
  switch (node.type) {
    case "doc":
      return convertChildren(node);

    case "paragraph":
      return `<p class="adf-p">${convertChildren(node)}</p>`;

    case "heading": {
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 2), 1), 6);
      return `<h${level} class="adf-h${level}">${convertChildren(node)}</h${level}>`;
    }

    case "bulletList":
      return `<ul class="adf-ul">${convertChildren(node)}</ul>`;

    case "orderedList":
      return `<ol class="adf-ol">${convertChildren(node)}</ol>`;

    case "listItem":
      return `<li class="adf-li">${convertChildren(node)}</li>`;

    case "blockquote":
      return `<blockquote class="adf-blockquote">${convertChildren(node)}</blockquote>`;

    case "codeBlock": {
      const lang = node.attrs?.language ? ` data-lang="${escapeHtml(String(node.attrs.language))}"` : "";
      return `<pre class="adf-pre"${lang}><code>${convertChildren(node)}</code></pre>`;
    }

    case "rule":
      return `<hr class="adf-hr" />`;

    case "hardBreak":
      return `<br />`;

    case "text": {
      const escaped = escapeHtml(node.text ?? "");
      return node.marks && node.marks.length > 0
        ? applyMarks(escaped, node.marks)
        : escaped;
    }

    case "mention": {
      const name = node.attrs?.text ?? node.attrs?.id ?? "mention";
      return `<span class="adf-mention">@${escapeHtml(String(name))}</span>`;
    }

    case "emoji": {
      const shortName = node.attrs?.shortName ?? "";
      const text = node.attrs?.text ?? shortName;
      return `<span class="adf-emoji" title="${escapeHtml(String(shortName))}">${escapeHtml(String(text))}</span>`;
    }

    case "inlineCard": {
      const url = node.attrs?.url ?? "#";
      const safe = escapeHtml(String(url));
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer" class="adf-link">${safe}</a>`;
    }

    case "panel": {
      const type = node.attrs?.panelType ?? "info";
      return `<div class="adf-panel adf-panel--${escapeHtml(String(type))}">${convertChildren(node)}</div>`;
    }

    case "table":
      return `<table class="adf-table"><tbody>${convertChildren(node)}</tbody></table>`;

    case "tableRow":
      return `<tr>${convertChildren(node)}</tr>`;

    case "tableHeader":
      return `<th class="adf-th">${convertChildren(node)}</th>`;

    case "tableCell":
      return `<td class="adf-td">${convertChildren(node)}</td>`;

    case "mediaSingle":
    case "media":
      // Can't embed actual attachments without extra API calls — show placeholder
      return `<div class="adf-media-placeholder">[attachment]</div>`;

    default:
      // Unknown node — still render children so text is not lost
      return convertChildren(node);
  }
}

function convertChildren(node: AdfNode): string {
  if (!node.content) return "";
  return node.content.map(convertNode).join("");
}

/**
 * Convert an ADF document object to an HTML string.
 * Returns an empty string if the input is null/undefined.
 */
export function adfToHtml(adf: AdfNode | null | undefined): string {
  if (!adf) return "";
  return convertNode(adf);
}
