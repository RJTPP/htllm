import type { ModelInfo } from '../../providers/types';
import { User, Bot } from 'lucide-react';
import { BrandLogo } from '../ui/BrandLogo';
import { brandForModelId } from '../../lib/model-meta';

export function Avatar({
  role,
  modelId,
  models,
}: {
  role: string;
  modelId: string | null;
  models: ModelInfo[];
}) {
  if (role === 'user') {
    return (
      <div className="w-7 h-7 shrink-0 rounded-md border border-line bg-surface2 flex items-center justify-center text-mute">
        <User size={15} />
      </div>
    );
  }
  const brand = modelId ? brandForModelId(modelId, models) : null;
  return (
    <div className="w-7 h-7 shrink-0 rounded-md border border-line bg-surface flex items-center justify-center">
      {brand ? <BrandLogo brand={brand} size={17} /> : <Bot size={15} className="text-mute" />}
    </div>
  );
}
