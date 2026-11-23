import { useState } from 'react';
import { ChevronRight, Brain } from 'lucide-react';
import { MessageBody } from './MessageBody';

/**
 * Collapsible block that displays the model's chain-of-thought reasoning.
 * Collapsed by default — the user can expand to inspect the thinking.
 */
export function ThinkingBlock({
  content,
  isThinking,
}: {
  /** The thinking content (markdown). */
  content: string | null;
  /** True when the model is still inside a `<think>` block (streaming). */
  isThinking: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  // While actively thinking, always show the block expanded.
  const isOpen = isThinking || expanded;

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-1.5 font-mono text-[10px] text-mute hover:text-text transition-colors group"
      >
        <ChevronRight
          size={12}
          className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}
        />
        <Brain size={12} className={isThinking ? 'text-accent animate-pulse' : 'text-mute'} />
        {isThinking ? (
          <span className="text-accent">
            thinking<span className="animate-pulse">...</span>
          </span>
        ) : (
          <span>thought for a moment</span>
        )}
      </button>

      {isOpen && content && (
        <div className="mt-1.5 ml-4 pl-3 border-l-2 border-accent/20">
          <div className="text-[12px] text-mute/80 leading-relaxed">
            <MessageBody content={content} />
          </div>
        </div>
      )}
    </div>
  );
}
