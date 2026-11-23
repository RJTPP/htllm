import { Box } from 'lucide-react';
import metaColor from '@lobehub/icons-static-svg/icons/meta-color.svg?raw';
import qwenColor from '@lobehub/icons-static-svg/icons/qwen-color.svg?raw';
import gemmaColor from '@lobehub/icons-static-svg/icons/gemma-color.svg?raw';
import microsoftColor from '@lobehub/icons-static-svg/icons/microsoft-color.svg?raw';
import mistralColor from '@lobehub/icons-static-svg/icons/mistral-color.svg?raw';
import huggingfaceColor from '@lobehub/icons-static-svg/icons/huggingface-color.svg?raw';
import deepseekColor from '@lobehub/icons-static-svg/icons/deepseek-color.svg?raw';
import ai2Color from '@lobehub/icons-static-svg/icons/ai2-color.svg?raw';
import togetherColor from '@lobehub/icons-static-svg/icons/together-color.svg?raw';
import stabilityColor from '@lobehub/icons-static-svg/icons/stability-color.svg?raw';

/**
 * Brand key → official lobehub color-logo SVG markup.
 *
 * Keys are the brand identifiers produced by `brandForFamily` in
 * lib/model-meta.ts. The lobehub icons are sized via `font-size` since
 * their intrinsic dimensions are `1em`.
 */
const BRAND_SVG: Record<string, string> = {
  meta: metaColor,
  qwen: qwenColor,
  google: gemmaColor, // the 'google' brand key represents the Gemma family
  microsoft: microsoftColor,
  mistral: mistralColor,
  hf: huggingfaceColor,
  deepseek: deepseekColor,
  ai2: ai2Color, // OLMo
  together: togetherColor, // RedPajama
  stability: stabilityColor, // StableLM
};

export function BrandLogo({ brand, size = 18 }: { brand: string | null; size?: number }) {
  const svg = brand ? BRAND_SVG[brand] : undefined;

  // Unknown brand: a neutral model glyph (never the app's own mark).
  if (!svg) return <Box size={size} strokeWidth={1.75} className="shrink-0 text-mute" aria-hidden="true" />;

  return (
    <span
      className="inline-flex items-center justify-center shrink-0"
      style={{ fontSize: size, width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
