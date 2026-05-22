import { useState, useEffect } from 'react';
import { openaiCompatProvider } from '../../providers/openai-compat/index';
import { Dot } from '../ui/Dot';
import { Modal } from '../ui/Modal';
import { Eye, EyeOff, TriangleAlert } from 'lucide-react';

const PRESETS: [string, string][] = [
  ['Groq', 'https://api.groq.com/openai/v1'],
  ['OpenRouter', 'https://openrouter.ai/api/v1'],
  ['Together', 'https://api.together.xyz/v1'],
];

type Status =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok'; count: number }
  | { kind: 'err'; msg: string };

export function OpenAICompatConfig() {
  const [baseURL, setBaseURL] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    openaiCompatProvider.loadConfig().then(() => {
      const c = openaiCompatProvider.getConfig();
      setBaseURL(c.baseURL);
      setApiKey(c.apiKey);
    });
  }, []);

  const configured = baseURL.trim().length > 0;

  const saveAndTest = async () => {
    setStatus({ kind: 'testing' });
    await openaiCompatProvider.configure(baseURL, apiKey);
    try {
      const models = await openaiCompatProvider.listModels();
      setStatus({ kind: 'ok', count: models.length });
    } catch (err) {
      setStatus({ kind: 'err', msg: err instanceof Error ? err.message : String(err) });
    }
  };

  // A key triggers the warning dialog first; a keyless endpoint (e.g. a local
  // server) has nothing sensitive to confirm, so it saves directly.
  const onSaveClick = () => {
    if (apiKey.trim()) {
      setConfirmOpen(true);
    } else {
      saveAndTest();
    }
  };

  const confirmSave = () => {
    setConfirmOpen(false);
    saveAndTest();
  };

  const inputCls =
    'w-full bg-bg border border-line focus:border-accent/60 focus:outline-none px-2.5 py-1.5 text-[12px] font-mono text-text placeholder:text-mute';

  return (
    <div className="border border-line bg-surface px-3 py-2.5 space-y-3">
      <div className="flex items-center gap-2.5">
        <Dot tone={configured ? 'ok' : 'mute'} />
        <span className="text-[13px] text-text shrink-0">OpenAI-compatible API</span>
        <span className="font-mono text-[9px] border border-line text-mute px-1.5 py-0.5">
          byok
        </span>
        <span
          className="inline-flex items-center gap-1 font-mono text-[9px] border border-warn/50 text-warn px-1.5 py-0.5"
          title="Your messages and key are sent to a third-party endpoint — inference happens off this device."
        >
          <TriangleAlert size={9} />
          off-device
        </span>
        <span
          className={`font-mono text-[10px] ${configured ? 'text-ok' : 'text-mute'}`}
        >
          {configured ? 'configured' : 'not configured'}
        </span>
      </div>
      <p className="font-mono text-[10px] text-mute leading-relaxed">
        Any /v1/chat/completions endpoint — Groq, OpenRouter, Together or a custom
        server. Key is stored in IndexedDB on this device only. The endpoint must
        allow browser requests (CORS); api.openai.com does not.
      </p>

      <div className="space-y-1.5">
        <label className="font-mono text-[10px] text-mute uppercase tracking-widest">
          base url
        </label>
        <input
          value={baseURL}
          onChange={(e) => setBaseURL(e.target.value)}
          placeholder="https://api.groq.com/openai/v1"
          className={inputCls}
          spellCheck={false}
        />
        <div className="flex gap-1.5 flex-wrap">
          {PRESETS.map(([name, url]) => (
            <button
              key={name}
              onClick={() => setBaseURL(url)}
              className="font-mono text-[10px] px-1.5 py-0.5 border border-line text-mute hover:text-text hover:border-line-hi"
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="font-mono text-[10px] text-mute uppercase tracking-widest">
          api key
        </label>
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-…"
            autoComplete="off"
            className={`${inputCls} pr-9`}
            spellCheck={false}
          />
          <button
            onClick={() => setShowKey((v) => !v)}
            title={showKey ? 'Hide key' : 'Show key'}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-mute hover:text-text"
          >
            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onSaveClick}
          disabled={!configured || status.kind === 'testing'}
          className="font-mono text-[11px] px-3 py-1.5 border border-accent/60 text-accent hover:bg-accent/10 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {status.kind === 'testing' ? 'connecting…' : 'save & test connection'}
        </button>
        {status.kind === 'ok' && (
          <span className="font-mono text-[10px] text-ok">
            connected — {status.count} models available
          </span>
        )}
        {status.kind === 'err' && (
          <span className="font-mono text-[10px] text-err break-all">{status.msg}</span>
        )}
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Before you save this key"
        width="max-w-lg"
      >
        <div className="p-4 space-y-3.5 text-[12.5px] text-mute leading-relaxed">
          <div className="flex items-center gap-2 text-warn">
            <TriangleAlert size={15} />
            <span className="font-mono text-[11px] uppercase tracking-widest">
              read this first
            </span>
          </div>
          <div>
            <div className="text-text text-[12.5px] font-semibold mb-0.5">
              How it works
            </div>
            Requests go straight from this browser to the endpoint you entered.
            There is no htllm server in between — htllm never sees your key or your
            messages.
          </div>
          <div>
            <div className="text-text text-[12.5px] font-semibold mb-0.5">
              Where the key is stored
            </div>
            The key is saved only in this browser's IndexedDB, in plain text. It is
            not encrypted, not synced, and never sent anywhere except as the
            Authorization header to your configured base URL. Anyone with access to
            this browser profile — or a browser extension that can read this page —
            can read it.
          </div>
          <div>
            <div className="text-text text-[12.5px] font-semibold mb-0.5">
              Use a low-privilege key
            </div>
            Prefer a key scoped to just this use, with a spending limit. Do not paste
            a key that controls billing, other projects, or sensitive resources.
          </div>
          <div>
            <div className="text-text text-[12.5px] font-semibold mb-0.5">
              At your own risk
            </div>
            You are responsible for the key and any usage or charges it incurs on the
            provider's side.
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => setConfirmOpen(false)}
              className="font-mono text-[11px] px-3 py-1.5 border border-line text-mute hover:text-text"
            >
              cancel
            </button>
            <button
              onClick={confirmSave}
              className="font-mono text-[11px] px-3 py-1.5 border border-accent/60 text-accent bg-accent/5 hover:bg-accent/15"
            >
              I understand — save key
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
