import type { ModelInfo } from '../../providers/types';
import { Icon } from '../ui/Icon';
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
        <Icon name="user" size={15} />
      </div>
    );
  }
  const brand = modelId ? brandForModelId(modelId, models) : null;
  return (
    <div className="w-7 h-7 shrink-0 rounded-md border border-line bg-surface flex items-center justify-center">
      {brand ? <BrandLogo brand={brand} size={17} /> : <Icon name="chat" size={15} />}
    </div>
  );
}
