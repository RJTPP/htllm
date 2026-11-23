import { readFile } from 'node:fs/promises';

// Mechanical metrics only. Answer correctness and citation grounding require
// the manual rubric; successful HTTP requests are not quality passes.
const report = JSON.parse(await readFile(process.argv[2] ?? 'eval/results/live.json', 'utf8'));
const rows = report.results;
if (!Array.isArray(rows)) throw new Error('Expected a results array');
const average = (values) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
// Same reference syntax and matching as src/lib/citations.ts.
const references = (answer) => [...answer.matchAll(/\[\[Source(?::\s*|\s+)([^\]\n]+)\]\]/g)].map((m) => m[1].trim());
const resolves = (ref, sources) => sources.some((s) => [s.id, s.chunkId, `${s.id}: ${s.filename}`, `${s.chunkId}: ${s.filename}`].includes(ref))
  || sources.filter((s) => s.filename === ref).length === 1 || (/^[1-9]\d*$/.test(ref) && Number(ref) <= sources.length);
const complete = rows.filter((row) => !row.error);
const unresolvedCitations = complete.flatMap((row) => references(row.answer).filter((ref) => !resolves(ref, row.sources))
  .map((ref) => ({ id: row.id, run: row.run, mode: row.mode, ref })));
const groups = {};
for (const kind of ['document', 'absent', 'research']) {
  for (const mode of ['chat', 'workspace', 'rag', 'agent']) {
    const selected = rows.filter((row) => row.kind === kind && row.mode === mode);
    if (!selected.length) continue;
    const done = selected.filter((row) => !row.error);
    const withUsage = done.filter((row) => row.usage);
    groups[`${kind}:${mode}`] = {
      count: selected.length,
      failures: selected.length - done.length,
      expectedEvidenceSupplied: kind === 'absent' ? null : done.filter((row) => row.expectedDocuments.every((id) => row.sources.some((source) => source.documentId === id || source.filename === `${id}.md`))).length,
      answersWithCitations: done.filter((row) => references(row.answer).length).length,
      budgetReached: done.filter((row) => row.budgetReached).length,
      averageLatencyMs: average(done.map((row) => row.latencyMs)),
      averageToolCount: average(done.map((row) => row.toolCount)),
      usageRecorded: withUsage.length,
      averagePromptTokens: average(withUsage.map((row) => row.usage.promptTokens)),
      averageCompletionTokens: average(withUsage.map((row) => row.usage.completionTokens)),
    };
  }
}
const expectedCount = report.expectedCount ?? 90;
console.log(JSON.stringify({
  model: report.model, embedding: report.embedding, contextWindow: report.contextWindow, band: report.band,
  count: rows.length, expectedCount, complete: rows.length === expectedCount,
  errors: rows.filter((row) => row.error).map(({ id, run, mode, error }) => ({ id, run, mode, error })),
  citationsNotResolvingToSuppliedSources: unresolvedCitations,
  qualityStatus: 'manual-review-required', groups,
}, null, 2));
