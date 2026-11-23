/**
 * Markdown-aware recursive text chunking — flat and hierarchical (D8).
 *
 * Research (Vecta 2026, NAACL 2025 Findings, LangChain
 * ParentDocumentRetriever) converges on parent-child hierarchical
 * recursive splitting as the production winner: small chunks for
 * embedding/retrieval precision, larger parent blocks returned to the
 * LLM for context. The strategy here:
 *
 *   1. For markdown, split by ATX headers first so each chunk carries its
 *      heading breadcrumb (used as source attribution at retrieval time).
 *   2. Within each section, fall back to paragraph -> sentence -> word
 *      boundaries to pack chunks up to `chunkSize` characters.
 *   3. Adjacent chunks overlap by `overlap` characters so a query phrase
 *      that straddles a boundary still hits at least one chunk fully.
 *   4. For hierarchical mode, repeat steps 1-3 at a larger parent size
 *      and map each child to the parent whose offset range contains it.
 *
 * Character-count is a coarse but provider-agnostic stand-in for token
 * count (~4 chars/token for English). Child default ~1600 chars (~400
 * tokens) with 15% overlap; parent default ~6000 chars (~1500 tokens)
 * with no overlap. These match D8's "400 child / 1500 parent" target.
 */

export interface ChunkOpts {
  /** Target chunk size in characters. Default 1600 (~400 tokens). */
  chunkSize?: number;
  /** Overlap between adjacent chunks in characters. Default 240 (~15%). */
  overlap?: number;
  /** When true, parse ATX headers and track a heading breadcrumb. */
  isMarkdown?: boolean;
}

export interface RawChunk {
  text: string;
  /** Character offset of this chunk within the source document. */
  startOffset: number;
  /** Heading breadcrumb, e.g. "Intro > Setup". Only present for markdown. */
  headingPath?: string;
}

interface Section {
  startOffset: number;
  text: string;
  headingPath: string;
}

const DEFAULT_CHUNK_SIZE = 1600;
const DEFAULT_OVERLAP = 240;
const DEFAULT_PARENT_SIZE = 6000;

/**
 * Split markdown into sections at ATX headers, tracking the heading
 * breadcrumb so chunks know which section they came from.
 */
function splitMarkdownSections(text: string): Section[] {
  const lines = text.split('\n');
  const sections: Section[] = [];
  // headings[i] = current heading text at depth i (1-based, so index 0 is unused).
  const headings: string[] = [];

  let currentStart = 0;
  let currentBuffer: string[] = [];
  let currentHeadingPath = '';
  let offset = 0;

  const flush = () => {
    if (currentBuffer.length === 0) return;
    const body = currentBuffer.join('\n').trim();
    if (body.length > 0) {
      sections.push({
        startOffset: currentStart,
        text: body,
        headingPath: currentHeadingPath,
      });
    }
    currentBuffer = [];
  };

  for (const line of lines) {
    const headerMatch = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (headerMatch) {
      flush();
      const depth = headerMatch[1]!.length;
      const title = headerMatch[2]!;
      headings.length = depth; // drop deeper levels
      headings[depth - 1] = title;
      currentHeadingPath = headings.filter(Boolean).join(' > ');
      currentStart = offset + line.length + 1; // +1 for the newline
    } else {
      currentBuffer.push(line);
    }
    offset += line.length + 1;
  }
  flush();

  // If the document had no headers at all, return one big section.
  if (sections.length === 0 && text.trim().length > 0) {
    sections.push({ startOffset: 0, text: text.trim(), headingPath: '' });
  }

  return sections;
}

/**
 * Split text into pieces that fit within `chunkSize`, preferring natural
 * boundaries in this order: paragraphs (\n\n) -> sentences (. ! ?) -> words.
 * Returns absolute offsets relative to the section start.
 */
function packPieces(
  sectionText: string,
  chunkSize: number,
  overlap: number,
): { text: string; offsetInSection: number }[] {
  // Step 1: break into candidate pieces (paragraphs, then sentences,
  // then words) that each fit within chunkSize.
  const pieces: { text: string; offsetInSection: number }[] = [];

  const paragraphs = splitWithOffsets(sectionText, /\n\n+/);
  for (const para of paragraphs) {
    if (para.text.length <= chunkSize) {
      pieces.push(para);
      continue;
    }
    // Paragraph too big — break by sentence.
    const sentences = splitWithOffsets(para.text, /(?<=[.!?])\s+/);
    for (const sent of sentences) {
      const absOffset = para.offsetInSection + sent.offsetInSection;
      if (sent.text.length <= chunkSize) {
        pieces.push({ text: sent.text, offsetInSection: absOffset });
        continue;
      }
      // Sentence too big — slide a window of chunkSize across it.
      let start = 0;
      while (start < sent.text.length) {
        const slice = sent.text.slice(start, start + chunkSize);
        pieces.push({ text: slice, offsetInSection: absOffset + start });
        if (start + chunkSize >= sent.text.length) break;
        start += chunkSize - overlap;
      }
    }
  }

  // Step 2: greedily pack pieces into chunks up to chunkSize, with overlap.
  const chunks: { text: string; offsetInSection: number }[] = [];
  let currentText = '';
  let currentStart = 0;

  for (const piece of pieces) {
    if (currentText.length === 0) {
      currentText = piece.text;
      currentStart = piece.offsetInSection;
      continue;
    }
    const candidate = `${currentText}\n\n${piece.text}`;
    if (candidate.length <= chunkSize) {
      currentText = candidate;
    } else {
      chunks.push({ text: currentText, offsetInSection: currentStart });
      // Apply overlap: prefix the new chunk with the tail of the previous.
      const tailStart = Math.max(0, currentText.length - overlap);
      const tail = currentText.slice(tailStart);
      currentText = `${tail}\n\n${piece.text}`;
      currentStart = currentStart + tailStart;
    }
  }
  if (currentText.length > 0) {
    chunks.push({ text: currentText, offsetInSection: currentStart });
  }

  return chunks;
}

/** Helper: split string by a separator while preserving absolute offsets. */
function splitWithOffsets(
  text: string,
  separator: RegExp,
): { text: string; offsetInSection: number }[] {
  const result: { text: string; offsetInSection: number }[] = [];
  // Force global flag so matchAll works.
  const re = new RegExp(separator.source, separator.flags.includes('g') ? separator.flags : `${separator.flags}g`);
  let lastIndex = 0;
  for (const match of text.matchAll(re)) {
    const matchIndex = match.index ?? 0;
    const piece = text.slice(lastIndex, matchIndex);
    if (piece.trim().length > 0) {
      result.push({ text: piece, offsetInSection: lastIndex });
    }
    lastIndex = matchIndex + match[0].length;
  }
  const tail = text.slice(lastIndex);
  if (tail.trim().length > 0) {
    result.push({ text: tail, offsetInSection: lastIndex });
  }
  return result;
}

export interface HierarchicalChunkOpts extends ChunkOpts {
  /** Target parent chunk size in characters. Default 6000 (~1500 tokens). */
  parentSize?: number;
}

/**
 * Pairing of a parent chunk with the child indices that fall inside it.
 * `parentIndex` is the position of the parent in the returned `parents`
 * array; ingest.ts uses it to resolve the (yet-unassigned) parent id and
 * stamp `parentId` onto the corresponding child rows.
 */
export interface HierarchicalChunkResult {
  parents: RawChunk[];
  children: RawChunk[];
  /**
   * For each child (same index as `children`), the index into `parents`
   * of the parent it belongs to. Always defined — every child belongs
   * to exactly one parent (the nearest parent whose offset range
   * contains the child's startOffset).
   */
  childParentIndex: number[];
}

/**
 * Hierarchical chunker — produces both parent and child chunks, plus the
 * mapping from each child to its parent. Children get embedded and
 * retrieved; parents get returned to the LLM. (D8)
 *
 * The mapping is positional: parents and children are generated from the
 * same source text at different granularities. For each child we pick
 * the last parent whose `startOffset` is ≤ the child's `startOffset` —
 * the parent that "encloses" it. This works because both passes walk
 * the document in the same order.
 */
export function chunkTextHierarchical(
  text: string,
  opts: HierarchicalChunkOpts = {},
): HierarchicalChunkResult {
  const childSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const childOverlap = Math.min(
    opts.overlap ?? DEFAULT_OVERLAP,
    Math.floor(childSize / 2),
  );
  const parentSize = opts.parentSize ?? DEFAULT_PARENT_SIZE;

  // Parents get no overlap — they're context, not retrieval targets.
  const parents = chunkText(text, {
    chunkSize: parentSize,
    overlap: 0,
    ...(opts.isMarkdown ? { isMarkdown: true } : {}),
  });
  const children = chunkText(text, {
    chunkSize: childSize,
    overlap: childOverlap,
    ...(opts.isMarkdown ? { isMarkdown: true } : {}),
  });

  // Map each child to its enclosing parent via offsets. Parents are
  // emitted in document order, so a linear scan works and is O(N+M).
  const childParentIndex: number[] = [];
  let parentCursor = 0;
  for (const child of children) {
    while (
      parentCursor + 1 < parents.length &&
      parents[parentCursor + 1]!.startOffset <= child.startOffset
    ) {
      parentCursor++;
    }
    // Defensive: if there are somehow no parents (empty doc), drop the
    // child mapping by pointing at 0 — chunkText would have returned []
    // for both, so this branch is unreachable in practice.
    childParentIndex.push(parents.length === 0 ? 0 : parentCursor);
  }

  return { parents, children, childParentIndex };
}

/**
 * Chunk a document into retrieval-ready pieces. Pure function with no I/O —
 * persistence happens in ingest.ts.
 */
export function chunkText(text: string, opts: ChunkOpts = {}): RawChunk[] {
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = Math.min(opts.overlap ?? DEFAULT_OVERLAP, Math.floor(chunkSize / 2));

  if (text.trim().length === 0) return [];

  const sections = opts.isMarkdown
    ? splitMarkdownSections(text)
    : [{ startOffset: 0, text: text.trim(), headingPath: '' }];

  const chunks: RawChunk[] = [];
  for (const section of sections) {
    const packed = packPieces(section.text, chunkSize, overlap);
    for (const piece of packed) {
      chunks.push({
        text: piece.text,
        startOffset: section.startOffset + piece.offsetInSection,
        ...(section.headingPath ? { headingPath: section.headingPath } : {}),
      });
    }
  }
  return chunks;
}
