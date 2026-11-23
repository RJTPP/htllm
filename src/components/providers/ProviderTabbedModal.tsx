import { type ReactNode } from 'react';
import { Modal } from '../ui/Modal';
import { ProviderLogo } from '../ui/ProviderLogo';

export interface ProviderTabDescriptor {
  /** Stable id used as the active-tab key. */
  id: string;
  label: string;
  /** Provider id passed to ProviderLogo. Optional — ProviderLogo falls
   *  back to a generic icon when unrecognized. */
  logoId?: string;
}

/**
 * Shared shell for tabbed provider pickers — ChatModelPicker and
 * EmbeddingModelModal both build on this. Owns:
 *   - Modal wrapper (title, subtitle, esc-to-close, portal)
 *   - Provider tab bar with logo + label, sticky at the top of the
 *     scroll area so it stays visible while a long model list scrolls
 *     below
 *   - Optional footer slot that sits below the scroll area
 *
 * The per-tab body is the children prop. The consumer is responsible for
 * picking which body to render based on the active tab id.
 */
export function ProviderTabbedModal({
  open,
  onClose,
  title,
  subtitle,
  width = 'max-w-3xl',
  stableHeight = false,
  tabs,
  activeTabId,
  onTabChange,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  width?: string;
  stableHeight?: boolean;
  tabs: ProviderTabDescriptor[];
  activeTabId: string;
  onTabChange: (id: string) => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      width={width}
      stableHeight={stableHeight}
    >
      <div className="flex flex-col min-h-0 h-full">
        {/* Tab bar — sticky so it stays put while the model list scrolls.
            position: sticky inside the Modal's scroll container works here
            because the Modal body is the scroll area. */}
        <div className="sticky top-0 z-20 flex border-b border-line bg-bg overflow-x-auto">
          {tabs.map((t) => {
            const active = t.id === activeTabId;
            return (
              <button
                key={t.id}
                onClick={() => onTabChange(t.id)}
                className={`flex items-center gap-1.5 font-mono text-[11px] px-4 py-2.5 border-r border-line whitespace-nowrap ${
                  active ? 'text-accent bg-accent/5' : 'text-mute hover:text-text'
                }`}
              >
                {t.logoId && <ProviderLogo providerId={t.logoId} size={13} />}
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab body — consumer renders the active panel here. */}
        <div className="flex-1 min-h-0">{children}</div>

        {footer && <div className="border-t border-line shrink-0">{footer}</div>}
      </div>
    </Modal>
  );
}
