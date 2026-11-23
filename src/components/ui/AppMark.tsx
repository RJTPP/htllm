/**
 * htllm's small mark (secondary to the ht<llm> wordmark): a sharp chat bubble
 * in the accent color with a cursor and an underscore, like a winking face.
 * Used where only a square fits, such as the assistant avatar fallback.
 */
export function AppMark({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={`shrink-0 ${className}`}>
      <path d="M6 7 H26 V21 H14 L9 26 V21 H6 Z" fill="none" stroke="rgb(var(--accent))" strokeWidth={size < 24 ? 3 : 2.4} />
      <rect x="11" y="11" width="4" height={size < 24 ? 7 : 6} fill="#e5e5e5" />
      <rect x="17" y="15" width="5" height={size < 24 ? 3 : 2} fill="#e5e5e5" />
    </svg>
  );
}
