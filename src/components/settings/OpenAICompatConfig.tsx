import { useState, useEffect } from 'react';
import { openaiCompatProvider } from '../../providers/openai-compat/index';
import { Dot } from '../ui/Dot';
import { Eye, EyeOff } from 'lucide-react';

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
          onClick={saveAndTest}
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
    </div>
  );
}
