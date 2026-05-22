import ollamaSvg from '@lobehub/icons-static-svg/icons/ollama.svg?raw';
import lmstudioSvg from '@lobehub/icons-static-svg/icons/lmstudio.svg?raw';
import { Cpu, Plug } from 'lucide-react';

/**
 * Provider id → official lobehub SVG markup. These icons are monochrome
 * (`fill="currentColor"`) so they inherit the surrounding text color.
 */
const PROVIDER_SVG: Record<string, string> = {
  ollama: ollamaSvg,
  lmstudio: lmstudioSvg,
};

/**
 * Logo for a chat provider. Ollama and LM Studio have official marks;
 * WebLLM and generic OpenAI-compatible endpoints fall back to lucide
 * icons (no official brand exists for an arbitrary endpoint).
 */
export function ProviderLogo({
  providerId,
  size = 16,
}: {
  providerId: string;
  size?: number;
}) {
  const svg = PROVIDER_SVG[providerId];
  if (svg) {
    return (
      <span
        className="inline-flex items-center justify-center shrink-0"
        style={{ fontSize: size, width: size, height: size }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }
  // WebLLM runs in-browser on WebGPU.
  if (providerId === 'webllm') return <Cpu size={size} className="shrink-0" />;
  // openai-compat / any user-supplied OpenAI-compatible endpoint.
  return <Plug size={size} className="shrink-0" />;
}
