import { readFile } from 'node:fs/promises';

// Mechanical metrics only. Answer correctness and citation grounding require
// the manual rubric; successful HTTP requests are not quality passes.
const report = JSON.parse(await readFile(process.argv[2] ?? 'eval/results/live.json', 'utf8'));
const rows = report.results;
if (!Array.isArray(rows)) throw new Error('Expected a results array');
const average = (values) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const groups = {};
const agentSourceMismatches = rows.filter((row) => row.mode === 'agent' && !row.error)
  .flatMap((row) => row.sources.filter((source) => !row.activity.some((event) =>
    event.status === 'complete' && event.result?.includes(source.excerpt)))
    .map((source) => ({ id: row.id, run: row.run, source: source.id })));
for (const kind of ['document', 'absent', 'research']) {
  for (const mode of ['rag', 'agent']) {
    const selected = rows.filter((row) => row.kind === kind && row.mode === mode);
    if (!selected.length) continue;
    const complete = selected.filter((row) => !row.error);
    const withUsage = complete.filter((row) => row.usage);
    groups[`${kind}:${mode}`] = {
      count: selected.length,
      failures: selected.length - complete.length,
      expectedEvidencePresent: kind === 'absent' ? null : complete.filter((row) => row.expectedDocuments.every((id) => row.sources.some((source) => source.documentId === id))).length,
      averageLatencyMs: average(complete.map((row) => row.latencyMs)),
      averageToolCount: average(complete.map((row) => row.toolCount)),
      usageRecorded: withUsage.length,
      averagePromptTokens: average(withUsage.map((row) => row.usage.promptTokens)),
      averageCompletionTokens: average(withUsage.map((row) => row.usage.completionTokens)),
    };
  }
}
console.log(JSON.stringify({
  model: report.model, embedding: report.embedding, contextWindow: report.contextWindow,
  count: rows.length, expectedCount: 90, complete: rows.length === 90,
  errors: rows.filter((row) => row.error).map(({ id, run, mode, error }) => ({ id, run, mode, error })),
  agentSourceExcerptsMissingFromToolResults: agentSourceMismatches,
  qualityStatus: 'manual-review-required', groups,
}, null, 2));
