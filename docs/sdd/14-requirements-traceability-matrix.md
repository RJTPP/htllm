## 14. Requirements Traceability Matrix

### 14.1 Requirement to Design Mapping Table

| Req ID | Requirement | Design Artifact | SDD Section | Status |
|---|---|---|---|---|
| HC-1 | Fully client-side, no server code | Astro `output: 'static'`, no SSR adapter, no API routes | 2.3, 4.2, 6.4, 16.1 | Covered |
| HC-2 | No secrets in source | Keys in IDB `keys` store only; no `.env` in client bundle | 5.6, 6.1, 11.3, 15.5 | Covered |
| HC-3 | No telemetry | No analytics scripts, no remote logging, CSP restricts origins | 2.3, 5.2, 6.4 | Covered |
| HC-4 | Provider abstraction is law | `ChatProvider` interface; no `provider.id` branching in components | 5.4, 5.7, 6.1, 16.1 | Covered |
| HC-5 | WebLLM in Web Worker | `webllm-worker.ts` with `MLCEngineWorkerHandler`; main thread uses `WebWorkerMLCEngine` | 4.1, 6.1, 12.1 | Covered |
| HC-6 | IDB access through `src/data/` only | Repository layer; hooks bridge to components | 5.6, 6.1, 12.1 | Covered |
| HC-7 | CSP via `<meta>` in every page | `BaseLayout.astro` includes CSP header | 2.3, 6.4, 15.5 | Covered |
| P1-1 | Astro scaffold | Pages, layouts, config files | 4.1, 12.1 | Covered |
| P1-2 | ChatProvider interface | `src/providers/types.ts` | 5.4, 5.7, 6.1 | Covered |
| P1-3 | WebLLM provider | `src/providers/webllm/` | 6.1, 12.1 | Covered |
| P1-4 | IndexedDB thread store | `src/data/` (5 stores) | 5.6, 11.1–11.4 | Covered |
| P1-5 | Multi-thread sidebar | `Sidebar.tsx`, `ThreadList.tsx` | 12.1, 13.2 | Covered |
| P1-6 | Model picker + system rail | `ModelPicker.tsx`, `SystemRail.tsx` | 12.1, 13.2 | Covered |
| P1-7 | System detection | `system-detect.ts`, `fit.ts` | 5.8, 6.1 | Covered |
| P1-8 | Chat with streaming | `ChatPanel.tsx`, `useChat` hook, `AsyncIterable<ChatChunk>` | 5.7, 5.8, 12.1 | Covered |
| P1-9 | Model parameters UI | `ModelParams.tsx`, per-thread overrides in IDB | 5.4, 11.3, 12.1, 13.2 | Covered |
| P1-10 | Vision / image attach | Multimodal `ContentPart[]`, compression, paste support | 5.4, 5.8, 11.3, 13.2 | Covered |
| P1-11 | Prompt templates | IDB `promptTemplates` store, `/` trigger, `PromptHints.tsx` | 5.6, 11.3, 12.1, 13.2 | Covered |
| P1-12 | Throughput display | `UsageStats` in `ChatChunk`, displayed in `MessageView.tsx` | 5.7, 11.3, 12.1 | Covered |
| P1-13 | Data import/export | `export.ts`, `ImportExport.tsx` | 6.1, 12.1 | Covered |
| P1-14 | Model family grouping + search | `model-list.ts`, `ModelPicker.tsx` | 6.1, 12.1, 13.2 | Covered |
| P2-1 | BYOK OpenAI-compatible providers | `OpenAICompatibleProvider`, provider registry, `ProviderConfig.tsx` | 6.1, 12.1 | Covered |
| P2-2 | Markdown rendering + code highlighting | `MessageBody.tsx`, `highlight.ts` (Shiki) | 6.1, 12.1 | Covered |
| P2-3 | Edit & resend user messages | `MessageView.tsx` edit mode, `useChat.editAndResend()` | 12.1, 12.2 | Covered |
| P2-4 | Thinking/reasoning mode | `ThinkingBlock.tsx`, `thinking.ts`, `reasoning.ts`, `ChatChunk.reasoning` | 5.8, 6.1, 12.1 | Covered |
| P2-5 | Command palette (Cmd+K) | `CommandPalette.tsx`, `searchMessages()` | 6.1, 12.1, 13.2 | Covered |
| P2-6 | Chat folders | `FolderSection.tsx`, `useFolders`, `folders` IDB store | 5.6, 6.1, 11.1, 12.1 | Covered |
| P2-7 | Model-generated titles | `title.ts`, `titleMode` setting | 6.1, 11.3 | Covered |
| P2-8 | Copy message button | `MessageView.tsx` CopyButton | 12.1 | Covered |
| P2-9 | Storage manager | `StorageManager.tsx`, `storage-stats.ts` | 6.1, 12.1, 13.2 | Covered |
| P2-10 | Accent color presets | CSS `--accent` variable, `SettingsModal.tsx` Appearance tab, 8 presets | 6.1, 11.3, 13.2 | Covered |
| P2-11 | API timing stats (TTFT) | `UsageStats.timeToFirstTokenMs`, `OpenAICompatibleProvider` | 5.7, 6.1, 11.3 | Covered |
| P2-12 | Performance/memory audit | rAF throttle, React.memo, highlight cache, lazy imports | 5.10, 12.1 | Covered |
| P2-13 | Regenerate response | `MessageView.tsx` regenerate button, `useChat.regenerate()` | 12.1, 12.2 | Covered |

### 14.2 Coverage Status and Open Items

| Status | Count | Items |
|---|---|---|
| **Covered** | 34 | All Phase 1 + Phase 2 requirements mapped |
| **Partial** | 1 | Accessibility |
| **Deferred** | 3 | Phase 3 RAG, Phase 4 agent, Phase 5 (voice, i18n, branching) |

**Open items:**

| Item | Owner | Next Action |
|---|---|---|
| Image compression quality vs. model accuracy | Developer | Test with WebLLM vision models; adjust target if needed |
| Accessibility screen reader audit | Developer | Conduct after Phase 1 UI implementation |
