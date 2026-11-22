/**
 * Accessible on/off toggle. A real switch affordance (track + knob) so it
 * reads as a toggle rather than as an action button. The accessible name
 * comes from `label`; visible text, if any, belongs to the caller's row.
 *
 * The active root carries `bg-accent/10` — browser tests assert it as the
 * "on" styling, so keep it on the element that has role="switch".
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name, e.g. "Use tools". */
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center border transition-colors focus-visible:outline focus-visible:outline-accent disabled:opacity-40 disabled:cursor-not-allowed ${
        checked
          ? 'border-accent/60 bg-accent/10 hover:bg-accent/20'
          : 'border-line bg-bg hover:border-line-hi'
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-1/2 h-3 w-3 -translate-y-1/2 transition-all ${
          checked ? 'left-[19px] bg-accent' : 'left-[3px] bg-mute'
        }`}
      />
    </button>
  );
}
