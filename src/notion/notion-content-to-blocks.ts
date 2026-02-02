/**
 * Pure Markdown → Notion block conversion. Used by NotionService when syncing note content.
 * Exported for unit testing.
 */

const MAX_NOTE_BLOCKS = 50;
const MAX_TEXT_LENGTH = 2000;

export type RichTextSegment = {
  type: 'text';
  text: { content: string; link?: { url: string } | null };
};

function richText(content: string): RichTextSegment[] {
  return [
    {
      type: 'text' as const,
      text: { content: content.slice(0, MAX_TEXT_LENGTH), link: null },
    },
  ];
}

/** Normalize URL: trim and fix escaped chars (e.g. \/ -> /, \_ -> _) so Notion receives a valid URL. */
export function normalizeUrl(url: string): string {
  return url
    .trim()
    .replace(/\\\//g, '/')
    .replace(/\\_/g, '_');
}

/** Parse inline Markdown links [text](url) and return Notion rich_text array (plain segments + link segments). */
export function richTextWithLinks(content: string): RichTextSegment[] {
  const out: RichTextSegment[] = [];
  const maxLen = MAX_TEXT_LENGTH;
  const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  linkRegex.lastIndex = 0;
  while ((match = linkRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index);
      if (text.length)
        out.push({ type: 'text', text: { content: text.slice(0, maxLen), link: null } });
    }
    const linkText = match[1].trim().slice(0, maxLen);
    const url = normalizeUrl(match[2]);
    if (linkText.length)
      out.push({ type: 'text', text: { content: linkText, link: url ? { url } : null } });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    const text = content.slice(lastIndex);
    if (text.length)
      out.push({ type: 'text', text: { content: text.slice(0, maxLen), link: null } });
  }
  if (out.length === 0 && content.length)
    out.push({ type: 'text', text: { content: content.slice(0, maxLen), link: null } });
  return out;
}

export type NotionBlock = { type: string; [k: string]: unknown };

/**
 * Convert note content (Markdown) to Notion block children.
 * Supports headings, lists, quote, divider, to-do, code block, images, paragraphs with links.
 */
export function noteContentToNotionBlocks(content: string): NotionBlock[] {
  const blocks: NotionBlock[] = [];
  if (!content?.trim()) return blocks;
  const lines = content.split('\n');
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;

  let i = 0;
  while (i < lines.length && blocks.length < MAX_NOTE_BLOCKS) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    i += 1;

    if (line === '') continue;

    // Headings: # ## ###
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3;
      const text = headingMatch[2].trim();
      if (text) {
        blocks.push({
          type: `heading_${level}`,
          [`heading_${level}`]: {
            rich_text: richTextWithLinks(text),
            color: 'default',
            is_toggleable: false,
          },
        });
      }
      continue;
    }

    // To-do: - [ ] or - [x]
    const todoMatch = line.match(/^-\s+\[([ xX])\]\s+(.*)$/);
    if (todoMatch) {
      const checked = todoMatch[1].toLowerCase() === 'x';
      const text = todoMatch[2].trim();
      blocks.push({
        type: 'to_do',
        to_do: {
          rich_text: richTextWithLinks(text),
          checked,
          color: 'default',
        },
      });
      continue;
    }

    // Bulleted list: - or *
    if (/^[-*]\s+/.test(line)) {
      const text = line.replace(/^[-*]\s+/, '').trim();
      blocks.push({
        type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: richTextWithLinks(text), color: 'default' },
      });
      continue;
    }

    // Numbered list: 1. 2. etc.
    const numberedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (numberedMatch) {
      const text = numberedMatch[1].trim();
      blocks.push({
        type: 'numbered_list_item',
        numbered_list_item: { rich_text: richTextWithLinks(text), color: 'default' },
      });
      continue;
    }

    // Blockquote: >
    if (line.startsWith('>')) {
      const text = line.replace(/^>\s*/, '').trim();
      if (text) {
        blocks.push({
          type: 'quote',
          quote: { rich_text: richTextWithLinks(text), color: 'default' },
        });
      }
      continue;
    }

    // Divider: --- *** ___
    if (/^(---|\*\*\*|___)\s*$/.test(line)) {
      blocks.push({ type: 'divider', divider: {} });
      continue;
    }

    // Fenced code block: ``` ... ```
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1; // consume closing ```
      const codeContent = codeLines.join('\n').slice(0, MAX_TEXT_LENGTH);
      blocks.push({
        type: 'code',
        code: {
          rich_text: richText(codeContent),
          language: lang && /^[a-z0-9+#-]+$/i.test(lang) ? lang : 'plain text',
        },
      });
      continue;
    }

    // Paragraph line: parse inline images and emit paragraph + image blocks
    const segments: Array<{ type: 'text'; value: string } | { type: 'image'; url: string }> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    imageRegex.lastIndex = 0;
    while ((match = imageRegex.exec(rawLine)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ type: 'text', value: rawLine.slice(lastIndex, match.index) });
      }
      const url = normalizeUrl(match[2]);
      if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        segments.push({ type: 'image', url });
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < rawLine.length) {
      segments.push({ type: 'text', value: rawLine.slice(lastIndex) });
    }
    for (const seg of segments) {
      if (blocks.length >= MAX_NOTE_BLOCKS) break;
      if (seg.type === 'text') {
        const text = seg.value.trim();
        if (text) {
          blocks.push({
            type: 'paragraph',
            paragraph: { rich_text: richTextWithLinks(text), color: 'default' },
          });
        }
      } else {
        blocks.push({
          type: 'image',
          image: { type: 'external', external: { url: seg.url } },
        });
      }
    }
  }
  return blocks;
}
