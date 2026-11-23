import { useRef, useLayoutEffect, useCallback, useState, useMemo, useEffect } from 'react';
import type { Thread, Message, ModelInfo, ModelParams, PromptTemplate, ReasoningEffort, ReasoningCapability, ConversationSummary } from '../../providers/types';
import type { ChatImage } from '../../lib/image';
import type { LibraryWithStats } from '../../hooks/useKnowledge';
import type { ConversationBudget } from '../../hooks/useChat';
import { ThreadMenu } from './ThreadMenu';
import { MessageView } from './MessageView';
import { EmptyState } from './EmptyState';
import { Composer } from './Composer';
import type { SlashCommand } from './SlashMenu';
import { SummaryDivider } from './SummaryDivider';
import { CompactingIndicator } from './CompactingIndicator';
import { TrimDivider } from './TrimDivider';
import { ArrowDown, FolderOpen } from 'lucide-react';
import { WorkspacePanel, type PanelView } from '../workspace/WorkspacePanel';
import { WorkspaceUIContext, type WorkspaceUI } from '../workspace/WorkspaceContext';
import { uploadToWorkspace, UPLOAD_ACCEPT } from '../../services/workspace-upload';
import { countWorkspaceFiles } from '../../data/workspace';
import { AttachmentChips } from '../workspace/AttachmentChips';
import { AgentControls } from './AgentControls';

const BOTTOM_SCROLL_THRESHOLD = 48;

function isNearBottom(el: HTMLDivElement) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SCROLL_THRESHOLD;
}

export function ChatPage({
  thread,
  messages,
  budget,
  models,
  loadedModelId,
  modelReady,
  generating,
  templates,
  defaultSystemPrompt,
  params,
  visionOk,
  reasoningCapability,
  onReasoningChange,
  onSend,
  onStop,
  onRegenerate,
  onEditAndResend,
  onOpenPicker,
  onParams,
  onChangeSystemPrompt,
  libraries,
  ragLibraryId,
  onChangeRagLibrary,
  onNewLibrary,
  historySummary,
  tailSummary,
  summaries,
  compacting,
  slashCommands,
  onChangeAgent,
  toolsCapable,
  toolsUnavailableReason,
  onChangeMode,
  fileChangeNotice,
  onDismissFileChangeNotice,
  blockedNotice,
  onManageConnections,
}: {
  onChangeAgent: (patch: Partial<Thread>) => void;
  toolsCapable: boolean;
  toolsUnavailableReason?: string;
  onChangeMode: (mode: import('../../providers/types').ThreadMode) => void;
  fileChangeNotice?: { path: string; version: number }[] | null;
  blockedNotice?: string | null;
  onDismissFileChangeNotice?: () => void;
  onManageConnections: () => void;
  thread: Thread | null;
  messages: Message[];
  /** Token-budget snapshot from useChat — drives the composer meter
   *  and surfaces sliding-window drop counts. Null while no thread is
   *  loaded; otherwise updated whenever messages/params/system change. */
  budget: ConversationBudget | null;
  /** D10b — active history summary (older turns folded). Renders as the
   *  "context compacted" divider. Null if none. */
  historySummary: ConversationSummary | null;
  /** D10b — active tail summary (a recent oversized exchange summarized
   *  into its own block). Null if none. Used (with historySummary) for
   *  coverage/locked. */
  tailSummary: ConversationSummary | null;
  /** D10b — every retained summary record (active + superseded), oldest
   *  first. One divider is rendered per record at its boundary so each
   *  compaction event leaves a persistent marker, even though only the
   *  active records feed the model. */
  summaries: ConversationSummary[];
  /** True while a compaction LLM call is in flight — shows the
   *  "compacting context…" indicator in place of the empty reply. */
  compacting: boolean;
  /** Slash commands for the composer's `/` menu (actions, incl.
   *  `/compact` which is the manual-compaction entry point now). */
  slashCommands: SlashCommand[];
  models: ModelInfo[];
  loadedModelId: string | null;
  modelReady: boolean;
  generating: boolean;
  templates: PromptTemplate[];
  defaultSystemPrompt: string;
  params: ModelParams;
  visionOk: boolean;
  reasoningCapability?: ReasoningCapability;
  onReasoningChange: (effort: ReasoningEffort) => void;
  onSend: (text: string, images?: ChatImage[], attachments?: import('../../providers/types').MessageAttachment[]) => void;
  onStop: () => void;
  onRegenerate: () => void;
  onEditAndResend: (messageId: string, newText: string) => void;
  onOpenPicker: () => void;
  onParams: () => void;
  onChangeSystemPrompt: (value: string) => void;
  /** Knowledge bindings — forwarded to the composer chip. */
  libraries: LibraryWithStats[];
  ragLibraryId: string | null;
  onChangeRagLibrary: (id: string | null) => void;
  onNewLibrary: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  useLayoutEffect(() => {
    shouldStickToBottomRef.current = true;
    setShowScrollButton(false);
  }, [thread?.id]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    shouldStickToBottomRef.current = true;
    el.scrollTop = el.scrollHeight;
    setShowScrollButton(false);
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = isNearBottom(el);
    shouldStickToBottomRef.current = nearBottom;
    setShowScrollButton(!nearBottom);
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !shouldStickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
    setShowScrollButton(false);
  });

  // Token meter source: prefer the live budget snapshot (predicts what
  // *would* be sent on the next request). Falls back to the model's
  // last reported usage when budget is unavailable (e.g. fresh thread
  // with no params yet). Both estimates only.
  const contextUsed = budget
    ? budget.systemTokens + budget.conversationTokens
    : (() => {
        for (let i = messages.length - 1; i >= 0; i--) {
          const u = messages[i]?.usage;
          if (u) return u.promptTokens + u.completionTokens;
        }
        return 0;
      })();

  // Ring measures against the full context window (what the user set),
  // so "X / 4.0k" matches their setting. Auto-compaction fires at 75%
  // of the window and the small output-reserve floor means trimming
  // happens just shy of 100% — both line up with this denominator.
  const contextTotal = budget?.contextWindow ?? params.contextWindow;

  const handleRegenerate = useCallback(() => {
    if (!modelReady) {
      onOpenPicker();
      return;
    }
    onRegenerate();
  }, [modelReady, onOpenPicker, onRegenerate]);

  const handleContinue = useCallback(() => onSend('Continue where you left off.'), [onSend]);

  // Workspace side panel (D-26): the Files list or a file viewer.
  const workspace = thread?.mode === 'workspace';
  const [panel, setPanel] = useState<PanelView | null>(null);
  useEffect(() => { setPanel(null); }, [thread?.id]);
  // Uploads (D-5): added to /uploads; any file locks the mode like a message does.
  const [uploads, setUploads] = useState(0);
  const [uploadNotice, setUploadNotice] = useState<{ ok: string[]; errors: string[] } | null>(null);
  const [hasFiles, setHasFiles] = useState(false);
  /** Uploads waiting to go with the next message. */
  const [pendingAttachments, setPendingAttachments] = useState<import('../../providers/types').MessageAttachment[]>([]);
  useEffect(() => { setPendingAttachments([]); }, [thread?.id]);
  // The status line is about the latest attach; clear it when the chat moves on.
  useEffect(() => { setUploadNotice(null); }, [thread?.id, messages.length]);
  useEffect(() => {
    let live = true;
    if (thread?.id) void countWorkspaceFiles(thread.id).then((n) => { if (live) setHasFiles(n > 0); });
    return () => { live = false; };
  }, [thread?.id, uploads, messages.length]);
  const attachFiles = useCallback(async (files: File[]) => {
    if (!thread) return;
    const ok: string[] = []; const errors: string[] = [];
    setUploadNotice({ ok: [`Adding ${files.length} file${files.length === 1 ? '' : 's'}…`], errors: [] });
    const added: import('../../providers/types').MessageAttachment[] = [];
    for (const file of files) {
      try {
        const saved = await uploadToWorkspace(thread.id, file);
        ok.push(saved.path);
        added.push({ fileId: saved.id, path: saved.path, chars: saved.text.length, ...(saved.pages?.length ? { pages: saved.pages.length } : {}) });
      } catch (error) { errors.push(error instanceof Error ? error.message : `${file.name} could not be added.`); }
    }
    // Successful uploads wait as chips and go with the next message; the notice keeps errors.
    setPendingAttachments((prev) => [...prev, ...added]);
    setUploadNotice({ ok: [], errors });
    setUploads((n) => n + 1);
  }, [thread]);
  const workspaceUI = useMemo<WorkspaceUI>(() => ({
    openFile: (fileId, version) => setPanel({ tab: 'file', fileId, version }),
    openFiles: () => setPanel({ tab: 'files' }),
  }), []);

  if (!thread) {
    return (
      <div className="reveal reveal-3 flex-1 overflow-y-auto grid-bg">
        <EmptyState onOpenPicker={onOpenPicker} modelReady={modelReady} model={loadedModelId} />
      </div>
    );
  }

  return (
    <WorkspaceUIContext.Provider value={workspaceUI}>
    <div className="reveal reveal-3 flex h-full min-h-0 min-w-0 flex-1 relative">
    <div className="flex flex-col h-full min-h-0 flex-1 min-w-0 relative">
      {/* Floating per-thread menu — system prompt lives here now instead
          of a permanent bar above the messages. */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
        {workspace && (
          <button
            onClick={() => setPanel(panel ? null : { tab: 'files' })}
            aria-label="Workspace files"
            aria-pressed={!!panel}
            className={`inline-flex items-center gap-1 px-2 py-1 border font-mono text-[11px] transition-colors bg-bg focus-visible:outline focus-visible:outline-accent ${panel ? 'border-accent/60 text-accent' : 'border-line text-mute hover:text-text'}`}
          >
            <FolderOpen size={12} /> files
          </button>
        )}
        <ThreadMenu
          value={thread.systemPrompt ?? defaultSystemPrompt}
          defaultPrompt={defaultSystemPrompt}
          onChange={onChangeSystemPrompt}
        />
      </div>
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto grid-bg">
        {messages.length === 0 ? (
          <EmptyState onOpenPicker={onOpenPicker} modelReady={modelReady} model={loadedModelId}
            mode={hasFiles ? undefined : thread.mode ?? 'chat'} onChangeMode={onChangeMode}
            workspaceUnavailable={toolsCapable ? undefined : `${toolsUnavailableReason ?? 'This model cannot use tools.'} Choose a tool-capable HTTP model before sending.`} />
        ) : (
          <div className="max-w-3xl mx-auto px-6 pt-6 pb-6 space-y-5">
            {(() => {
              // D10b — one persistent divider per retained compaction
              // record. Covered messages stay visible in the UI (we never
              // delete them); each record's divider sits above the first
              // message NOT covered by THAT record, so successive
              // compactions leave a trail of markers going down the list.
              // Only the active history/tail records feed the model — the
              // markers are purely UX history.
              //
              // Per-record caption shows the delta vs the prior record of
              // the same kind (what THIS compaction folded), not the
              // cumulative total. Records arrive oldest-first.
              const prevSameKind: Record<string, ConversationSummary | undefined> = {};
              const dividers = summaries
                .map((rec) => {
                  const idx = messages.findIndex(
                    (m) => !rec.replacedMessageIds.includes(m.id),
                  );
                  const prev = prevSameKind[rec.kind];
                  prevSameKind[rec.kind] = rec;
                  const turns =
                    rec.replacedMessageIds.length -
                    (prev?.replacedMessageIds.length ?? 0);
                  const fromTokens = rec.replacedTokens - (prev?.replacedTokens ?? 0);
                  return { rec, idx, turns, fromTokens };
                })
                // idx === -1 means every message is covered by the record
                // (shouldn't happen for the active one, but guard anyway).
                .filter((d) => d.idx >= 0 && d.turns > 0);
              const dividersByIdx = new Map<number, typeof dividers>();
              for (const d of dividers) {
                const arr = dividersByIdx.get(d.idx) ?? [];
                arr.push(d);
                dividersByIdx.set(d.idx, arr);
              }

              // Coverage for edit-locking + the trim-divider math: the
              // union of the ACTIVE records (what the model actually
              // doesn't see verbatim).
              const allCovered =
                historySummary || tailSummary
                  ? new Set([
                      ...(historySummary?.replacedMessageIds ?? []),
                      ...(tailSummary?.replacedMessageIds ?? []),
                    ])
                  : null;
              const firstFreshIdx = allCovered
                ? messages.findIndex((m) => !allCovered.has(m.id))
                : -1;

              // Trim horizon: the oldest message actually sent verbatim on
              // the last fit. Messages between the summary boundary and
              // this index are in the UI but weren't sent (sliding window).
              // We only render the divider when there's a genuine gap —
              // i.e. some non-covered message sits above the first-sent one.
              const trimIdx = budget?.firstSentMessageId
                ? messages.findIndex((m) => m.id === budget.firstSentMessageId)
                : -1;
              const summaryEnd = firstFreshIdx === -1 ? 0 : firstFreshIdx;
              const trimmedCount =
                trimIdx > summaryEnd ? trimIdx - summaryEnd : 0;

              const rows = messages.map((m, i) => {
                const isLast = i === messages.length - 1;
                // While AUTO-compacting, the trailing assistant placeholder
                // is empty (the stream hasn't started) — replace it with the
                // "compacting context…" indicator. Only suppress an EMPTY
                // placeholder: during MANUAL compact the last message is a
                // real reply (generating=false), and hiding it made the
                // divider appear to "jump" past it. (#4)
                const isEmptyPlaceholder =
                  m.role === 'assistant' &&
                  generating &&
                  (typeof m.content === 'string'
                    ? m.content.length === 0
                    : m.content.length === 0);
                const suppressForCompacting =
                  compacting && isLast && isEmptyPlaceholder;
                return (
                  <div key={m.id}>
                    {(dividersByIdx.get(i) ?? []).map((d) => (
                      <SummaryDivider
                        key={d.rec.id}
                        summary={d.rec}
                        label={d.rec.kind === 'tail' ? 'last turn summarized' : 'context compacted'}
                        turns={d.turns}
                        fromTokens={d.fromTokens}
                      />
                    ))}
                    {trimmedCount > 0 && i === trimIdx && (
                      <TrimDivider count={trimmedCount} />
                    )}
                    {suppressForCompacting ? (
                      <CompactingIndicator />
                    ) : (
                      <MessageView
                        message={m}
                        modelId={loadedModelId}
                        models={models}
                        streaming={generating && isLast && m.role === 'assistant'}
                        isLast={isLast}
                        generating={generating}
                        onRegenerate={handleRegenerate}
                        onEditAndResend={onEditAndResend}
                        onContinue={handleContinue}
                        locked={allCovered?.has(m.id) ?? false}
                      />
                    )}
                  </div>
                );
              });
              // Manual compact runs with generating=false, so there's no
              // empty placeholder to host the indicator. Append it at the
              // bottom while a manual compaction is in flight — without
              // hiding any real message.
              return (
                <>
                  {rows}
                  {compacting && !generating && <CompactingIndicator />}
                </>
              );
            })()}
          </div>
        )}
      </div>
      {showScrollButton && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-28 left-1/2 -translate-x-1/2 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-mute shadow-lg hover:text-text hover:border-accent/60 transition-colors"
          title="Jump to latest message"
          aria-label="Jump to latest message"
        >
          <ArrowDown size={16} />
        </button>
      )}
      <Composer
        toolControls={thread && <AgentControls mode={thread.mode ?? 'chat'} thread={thread} libraryId={ragLibraryId} libraries={libraries} onSelectLibrary={onChangeRagLibrary} onNewLibrary={onNewLibrary} capable={toolsCapable} unavailableReason={toolsUnavailableReason} busy={generating} onChange={onChangeAgent} onManageConnections={onManageConnections} />}
        modelReady={modelReady}
        model={loadedModelId}
        visionOk={visionOk}
        generating={generating}
        templates={templates}
        contextUsed={contextUsed}
        contextTotal={contextTotal}
        compacting={compacting}
        slashCommands={slashCommands}
        reasoningCapability={reasoningCapability}
        reasoningEffort={params.reasoningEffort}
        onReasoningChange={onReasoningChange}
        onSend={(text, images) => { onSend(text, images, pendingAttachments.length ? pendingAttachments : undefined); setPendingAttachments([]); }}
        onStop={onStop}
        onParams={onParams}
        onAttachFiles={workspace ? (files) => void attachFiles(files) : undefined}
        attachAccept={UPLOAD_ACCEPT}
        notice={(uploadNotice && (uploadNotice.ok.length || uploadNotice.errors.length)) || fileChangeNotice?.length || blockedNotice || pendingAttachments.length ? <>
          {blockedNotice && <div className="text-err">{blockedNotice}</div>}
          {fileChangeNotice?.length ? <div className="text-warn flex items-start gap-2">
            <span className="flex-1">File changes from the removed reply remain: {fileChangeNotice.map((f) => `${f.path} (v${f.version})`).join(', ')}. Open files to review or keep editing.</span>
            {workspace && <button onClick={() => setPanel({ tab: 'files' })} className="underline hover:text-text">files</button>}
            <button onClick={onDismissFileChangeNotice} aria-label="Dismiss file change notice" className="hover:text-text">✕</button>
          </div> : null}
          {pendingAttachments.length > 0 && <div className="flex items-center gap-2"><span className="text-mute shrink-0">Attaching:</span><AttachmentChips attachments={pendingAttachments} onRemove={(id) => setPendingAttachments((prev) => prev.filter((a) => a.fileId !== id))} /></div>}
          {uploadNotice?.ok.map((line) => <div key={line} className="text-ok">{line}</div>)}
          {uploadNotice?.errors.map((line) => <div key={line} className="text-err">{line}</div>)}
        </> : undefined}
      />
    </div>
    {workspace && panel && (
      <WorkspacePanel
        threadId={thread.id}
        libraryName={libraries.find(({ lib }) => lib.id === ragLibraryId)?.lib.name}
        refreshKey={`${messages.length}:${generating}:${messages.at(-1)?.presentedFiles?.length ?? 0}:${uploads}`}
        view={panel}
        onView={setPanel}
        onClose={() => setPanel(null)}
      />
    )}
    </div>
    </WorkspaceUIContext.Provider>
  );
}
