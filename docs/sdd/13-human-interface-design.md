## 13. Human Interface Design

### 13.1 UX Flow Summary

**Primary user journey: First-time use**

```
1. User opens htllm → Landing page with animated boot sequence and shader backdrop
2. Clicks "Open App" → App page loads
3. System rail probes hardware → badges appear in header
4. If no WebGPU → block screen with explanation
5. Sidebar shows empty thread list + "no model" footer
6. User clicks model footer → Model Picker popup opens
7. Model catalog loads → grouped by family, sorted by VRAM
8. User searches or browses → selects a model → clicks "Load"
9. StatusPanel shows download progress → model loads
10. Popup auto-closes (or user closes) → sidebar shows model name
11. New thread auto-created → chat panel shows EmptyState
12. User types message → sends → streaming response appears
13. Thread title auto-generated → sidebar shows thread
14. User can create new threads, switch between them, adjust params
15. User presses Cmd+K → Command palette for search and thread navigation
16. User creates folders → organizes threads into collapsible groups
17. User opens Settings → Appearance → selects accent color
```

**Secondary flows:**

- **Switch model:** Click model footer → open picker → load different model → existing threads retain their model association
- **Image attach:** Click attach icon (or paste) → image compressed → thumbnail preview → send with text
- **Prompt template:** Type `/` → dropdown appears → arrow-key navigate → Enter to insert
- **Export data:** Settings/menu → Export All → JSON file downloaded
- **Import data:** Settings/menu → Import → file picker → confirmation → data restored
- **Command palette:** Cmd+K → type query → see threads + matching messages → select to navigate
- **Folder organization:** Right-click sidebar area → create folder → drag threads into folder → collapse/expand
- **Edit & resend:** Hover user message → click edit → modify text → save & resend → new response from that point
- **Copy message:** Hover any message → click copy → text copied to clipboard
- **Regenerate:** Hover last assistant message → click regenerate → new response for same prompt
- **Storage management:** Nav rail → Storage page → view model cache sizes → delete individual caches → view IDB stats
- **Accent color:** Settings → Appearance → click color swatch → accent updates globally including landing page

### 13.2 Key Screens/Wireframes

#### Screen 1: Landing Page (`/`)

```
┌──────────────────────────────────────────────────────────┐
│  ht[LLM]                                                 │
│                                                          │
│  HyperText LLM — fully client-side WebGPU chat           │
│  with local + BYOK models.                               │
│  No server, no embedded secrets, no telemetry.           │
│                                                          │
│  [Open App →]                                            │
│                                                          │
│  • In-browser inference via WebGPU                       │
│  • Bring your own API keys (stored locally)              │
│  • Multi-thread conversations                            │
│  • Privacy by architecture, not policy                   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

Interactive React landing page with animated boot sequence, WebGL shader backdrop, and persisted accent color from IndexedDB. First-time visitors see the boot animation; returning visitors redirect to /app.

#### Screen 2: App — No Model Loaded

```
┌─────────────────────────────────────────────────────────────────┐
│ HEADER                                                          │
│ [ht·LLM logo]  htllm                    [SystemRail badges]    │
│ in-browser inference · webgpu                                   │
├────────────────┬────────────────────────────────────────────────┤
│ SIDEBAR        │ CHAT AREA                                     │
│                │                                                │
│ [+ New Thread] │  ┌──────────────────────────────────────┐     │
│                │  │ README                                │     │
│ (empty)        │  │                                       │     │
│                │  │ Local-only chat. No server.           │     │
│                │  │ Models run entirely in your browser   │     │
│                │  │ via WebGPU.                           │     │
│                │  │                                       │     │
│                │  │ 1·pick  2·load  3·chat                │     │
│                │  │                                       │     │
│                │  └──────────────────────────────────────┘     │
│                │                                                │
│────────────────│                                                │
│ ▸ no model     │  [input disabled: "Load a model to begin"]    │
│   click to pick│                                                │
└────────────────┴────────────────────────────────────────────────┘
```

#### Screen 3: Model Picker Popup (overlay)

```
┌──────────────────────────────────────────────────────────────┐
│                     ┌─────────────────────────────────┐      │
│   (backdrop)        │ MODEL PICKER                    │      │
│                     │                                 │      │
│                     │ [🔍 Search models...]           │      │
│                     │ [☑ fit only]                    │      │
│                     │                                 │      │
│                     │ ▾ Llama 3.2                     │      │
│                     │   ├─ 1B-Instruct q4f32  1.1 GB │      │
│                     │   │  [cached] [load]            │      │
│                     │   ├─ 3B-Instruct q4f16  2.0 GB │      │
│                     │   │  [too large]                │      │
│                     │   └─ ...                        │      │
│                     │                                 │      │
│                     │ ▸ Phi 3.5                       │      │
│                     │ ▸ Qwen 2.5                      │      │
│                     │ ▸ Gemma 2                       │      │
│                     │                                 │      │
│                     │ ▾ Parameters                    │      │
│                     │   Temperature: [====|----] 1.0  │      │
│                     │   Top P:       [=========] 1.0  │      │
│                     │   Max tokens:  [4000      ]     │      │
│                     │   Presence:    [====|====] 0.0  │      │
│                     │   Frequency:   [====|====] 0.0  │      │
│                     │                                 │      │
│                     │ ─────────────────────────────── │      │
│                     │ STATUS: Loading Llama 3.2...    │      │
│                     │ [████████░░░░░░░░] 52%          │      │
│                     └─────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────┘
```

Dismiss via backdrop click or Escape.

#### Screen 4: Active Chat

```
┌─────────────────────────────────────────────────────────────────┐
│ HEADER                                                          │
│ [ht·LLM]  htllm                          [SystemRail badges]   │
├────────────────┬────────────────────────────────────────────────┤
│ SIDEBAR        │ CHAT AREA                                     │
│                │                                                │
│ [+ New Thread] │  YOU                                          │
│                │  What is the capital of France?               │
│ ● Thread 1     │                                                │
│   Thread 2     │  LLAMA-3.2-1B-INSTRUCT                        │
│   Thread 3     │  The capital of France is Paris. It is the    │
│                │  largest city in France and serves as the     │
│                │  country's political, economic, and cultural  │
│                │  center.█                                     │
│                │  Prefill: 342 tok/s · Decode: 28 tok/s       │
│                │                                                │
│────────────────│────────────────────────────────────────────────│
│ ▸ Llama 3.2-1B │  [📎] [          Type a message...          ] │
│   loaded       │       [                              ] [send→]│
└────────────────┴────────────────────────────────────────────────┘
```

#### Screen 5: Image Attachment (vision model loaded)

```
│                │                                                │
│                │  ┌─────┐ ┌─────┐                              │
│                │  │img 1│ │img 2│  (thumbnails with ✕ remove)  │
│                │  └─────┘ └─────┘                              │
│                │  [📎] [What's in these images?     ] [send→]  │
```

#### Screen 6: Prompt Hints (typing `/`)

```
│                │                                                │
│                │  ┌──────────────────────────┐                  │
│                │  │ General Assistant         │ ◄── selected    │
│                │  │ Code Helper               │                 │
│                │  │ Explain Like I'm 5        │                 │
│                │  └──────────────────────────┘                  │
│                │  [/general                             ]       │
```

#### Screen 7: Command Palette (Cmd+K overlay)

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│          ┌──────────────────────────────────────┐            │
│  (dim    │ 🔍 Search threads and messages...    │            │
│   back-  │                                      │            │
│   drop)  │ THREADS                              │            │
│          │ ● Thread: Capital of France           │ ◄ active  │
│          │   Thread: React hooks                 │            │
│          │   Thread: Python sorting              │            │
│          │                                      │            │
│          │ MESSAGES                              │            │
│          │   "The capital of France is..."       │            │
│          │   — in Capital of France              │            │
│          └──────────────────────────────────────┘            │
└──────────────────────────────────────────────────────────────┘
```

#### Screen 8: Storage Manager

```
┌──────────────────────────────────────────────────────────────┐
│ NAV   │ STORAGE                                              │
│       │                                                      │
│ chat  │ Browser Storage                                      │
│ *stor*│ [████████████░░░░░] 2.1 GB / 8.0 GB                │
│ know  │                                                      │
│       │ Model Weights (Cache API)                            │
│       │ ┌──────────────────────────────────────────┐         │
│       │ │ Llama-3.2-1B q4f32  │ 1.1 GB  [delete] │         │
│       │ │ Qwen3-0.6B q4f16    │ 0.4 GB  [delete] │         │
│       │ └──────────────────────────────────────────┘         │
│       │                                                      │
│       │ IndexedDB                                            │
│       │ threads: 12  messages: 847  keys: 2  ...            │
│       │                                                      │
│       │ Reset? → Go to Settings → About                      │
└───────┴──────────────────────────────────────────────────────┘
```

#### Screen 9: Settings — Appearance Tab

```
┌──────────────────────────────────────────────────────────────┐
│ SETTINGS                                          [✕ close] │
│                                                              │
│ Templates | Providers | Chat defaults | *Appearance* | About │
│──────────────────────────────────────────────────────────────│
│                                                              │
│ ACCENT COLOR                                                 │
│ ● Amber   ● Soft Amber   ● Cyan   ● Tokyo Blue             │
│ ● Violet  ● Emerald      ● Rose   ● Gray                   │
│                                                              │
│ CODE BLOCK THEME                                             │
│ [vesper ▾]                                                   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 13.3 Interaction Constraints

**Keyboard navigation:**

| Context | Key | Action |
|---|---|---|
| Composer | `Enter` | Send message |
| Composer | `Shift+Enter` | New line |
| Composer | `/` (first char) | Open prompt hints |
| Prompt hints | `↑`/`↓` | Navigate |
| Prompt hints | `Enter` | Select template |
| Prompt hints | `Escape` | Dismiss |
| Modal (any) | `Escape` | Close modal |
| Chat (generating) | Stop button | Abort generation |
| Global | `Cmd+K` / `Ctrl+K` | Open command palette |
| Command palette | `↑`/`↓` | Navigate results |
| Command palette | `Enter` | Select result |
| Command palette | `Escape` | Close palette |
| Chat (message hover) | — | Show copy/edit/regenerate buttons |
| Edit mode | `Enter` | Save & resend |
| Edit mode | `Shift+Enter` | New line in edit |
| Edit mode | `Escape` | Cancel edit |

**Responsiveness:**

| Breakpoint | Behavior |
|---|---|
| ≥1024px (desktop) | Sidebar visible (280px), chat fills remainder |
| 768–1023px (tablet) | Sidebar collapsible via toggle button |
| <768px (mobile) | Sidebar hidden by default, toggle to show. Model picker full-screen instead of centered popup. Note: WebGPU inference is unlikely to work on mobile, but external providers (Phase 2) will. |

**Page navigation:**

| Page | Nav Rail Item | Content |
|---|---|---|
| Chat | Default | Thread sidebar + chat panel |
| Storage | Second item | Storage manager (model weights + IDB) |
| Knowledge | Third item | Phase 3 placeholder |

**Accessibility:**

- All interactive elements have visible focus indicators
- Modal focus trap: Tab cycles within modal when open
- Status changes (model loaded, generation complete) announced via `aria-live` region
- Color is never the sole indicator — badges include text labels alongside colored dots
- Minimum touch target: 44×44px for mobile breakpoint

**UX consistency constraints:**

- All font sizes use the design system scale: `10px` (labels), `11px` (mono UI), `13px` (body mono), `14px` (body sans)
- All colors from the Tailwind theme — no inline hex values
- All borders 1px solid. Rounded corners only on user message bubbles (`rounded-lg rounded-tl-sm`).
- Accent color is runtime-switchable via CSS custom property `--accent` (8 presets). Persisted to IDB.
- All font sizes, border styles, and spacing follow the design system.
- Animations: `pulse-dot`, `spin`, `blink` cursor, `reveal` cascade on landing page, `wm-glitch` on boot complete, `scanlines` overlay, `grain` film effect — all respect `prefers-reduced-motion: reduce`.
- Model IDs, status text, and assistant output in JetBrains Mono; UI chrome and user text in Geist
