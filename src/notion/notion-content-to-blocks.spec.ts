import { describe, it, expect } from 'vitest';
import {
  normalizeUrl,
  richTextWithLinks,
  noteContentToNotionBlocks,
  type NotionBlock,
} from './notion-content-to-blocks';

describe('normalizeUrl', () => {
  it('trims whitespace', () => {
    expect(normalizeUrl('  https://example.com  ')).toBe('https://example.com');
  });

  it('replaces escaped slashes with forward slash', () => {
    expect(normalizeUrl('https:\\/\\/example.com\\/path')).toBe(
      'https://example.com/path',
    );
  });

  it('replaces escaped underscore with underscore', () => {
    expect(normalizeUrl('https://cdn.example.com/img1\\_1.png')).toBe(
      'https://cdn.example.com/img1_1.png',
    );
  });

  it('leaves normal URL unchanged', () => {
    const url =
      'https://dsfbzdgqpy3c.cloudfront.net/images/2026/01/31/1769930718043-220aff25-img1/_1.png';
    expect(normalizeUrl(url)).toBe(url);
  });
});

describe('richTextWithLinks', () => {
  it('returns plain text as single segment with link null', () => {
    expect(richTextWithLinks('hello')).toEqual([
      { type: 'text', text: { content: 'hello', link: null } },
    ]);
  });

  it('parses [text](url) as link segment', () => {
    expect(richTextWithLinks('see [Notion](https://notion.so) here')).toEqual([
      { type: 'text', text: { content: 'see ', link: null } },
      { type: 'text', text: { content: 'Notion', link: { url: 'https://notion.so' } } },
      { type: 'text', text: { content: ' here', link: null } },
    ]);
  });

  it('returns single plain segment when no links', () => {
    expect(richTextWithLinks('no links here')).toEqual([
      { type: 'text', text: { content: 'no links here', link: null } },
    ]);
  });

  it('normalizes link URL (escaped chars)', () => {
    const out = richTextWithLinks('[x](https:\\/\\/example.com)');
    expect(out).toHaveLength(1);
    expect(out[0].text.link).toEqual({ url: 'https://example.com' });
  });
});

describe('noteContentToNotionBlocks', () => {
  it('returns empty array for empty or whitespace content', () => {
    expect(noteContentToNotionBlocks('')).toEqual([]);
    expect(noteContentToNotionBlocks('   \n  ')).toEqual([]);
  });

  it('converts # heading to heading_1', () => {
    const blocks = noteContentToNotionBlocks('# Hello');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('heading_1');
    expect((blocks[0] as NotionBlock).heading_1).toBeDefined();
    expect((blocks[0] as NotionBlock).heading_1?.rich_text).toHaveLength(1);
  });

  it('converts ## and ### to heading_2 and heading_3', () => {
    expect(noteContentToNotionBlocks('## Two')[0].type).toBe('heading_2');
    expect(noteContentToNotionBlocks('### Three')[0].type).toBe('heading_3');
  });

  it('converts - item to bulleted_list_item', () => {
    const blocks = noteContentToNotionBlocks('- item');
    expect(blocks[0].type).toBe('bulleted_list_item');
  });

  it('converts 1. item to numbered_list_item', () => {
    const blocks = noteContentToNotionBlocks('1. first');
    expect(blocks[0].type).toBe('numbered_list_item');
  });

  it('converts - [ ] and - [x] to to_do', () => {
    const unchecked = noteContentToNotionBlocks('- [ ] todo');
    expect(unchecked[0].type).toBe('to_do');
    expect((unchecked[0] as NotionBlock).to_do?.checked).toBe(false);
    const checked = noteContentToNotionBlocks('- [x] done');
    expect((checked[0] as NotionBlock).to_do?.checked).toBe(true);
  });

  it('converts > quote to quote block', () => {
    const blocks = noteContentToNotionBlocks('> quoted');
    expect(blocks[0].type).toBe('quote');
  });

  it('converts --- to divider', () => {
    const blocks = noteContentToNotionBlocks('---');
    expect(blocks[0].type).toBe('divider');
  });

  it('converts fenced code block to code block', () => {
    const blocks = noteContentToNotionBlocks('```js\nconst x = 1;\n```');
    expect(blocks[0].type).toBe('code');
    expect((blocks[0] as NotionBlock).code?.language).toBe('js');
  });

  it('converts ![alt](url) to image block with normalized URL', () => {
    const url =
      'https://dsfbzdgqpy3c.cloudfront.net/images/2026/01/31/1769930718043-220aff25-img1/_1.png';
    const blocks = noteContentToNotionBlocks(`![image](${url})`);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('image');
    expect((blocks[0] as NotionBlock).image).toEqual({
      type: 'external',
      external: { url },
    });
  });

  it('normalizes image URL with escaped underscore', () => {
    const blocks = noteContentToNotionBlocks(
      '![img](https://cdn.example.com/path\\_1.png)',
    );
    expect((blocks[0] as NotionBlock).image?.external?.url).toBe(
      'https://cdn.example.com/path_1.png',
    );
  });

  it('converts plain line to paragraph', () => {
    const blocks = noteContentToNotionBlocks('plain text');
    expect(blocks[0].type).toBe('paragraph');
  });

  it('parses link in paragraph', () => {
    const blocks = noteContentToNotionBlocks('Check [link](https://example.com) out');
    expect(blocks[0].type).toBe('paragraph');
    const rich = (blocks[0] as NotionBlock).paragraph?.rich_text as Array<{
      text: { content: string; link?: { url: string } | null };
    }>;
    expect(rich).toHaveLength(3);
    expect(rich[1].text.link).toEqual({ url: 'https://example.com' });
  });

  it('skips empty lines', () => {
    const blocks = noteContentToNotionBlocks('# A\n\n\n## B');
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('heading_1');
    expect(blocks[1].type).toBe('heading_2');
  });

  it('caps at MAX_NOTE_BLOCKS (50)', () => {
    const lines = Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n');
    const blocks = noteContentToNotionBlocks(lines);
    expect(blocks.length).toBeLessThanOrEqual(50);
  });
});
