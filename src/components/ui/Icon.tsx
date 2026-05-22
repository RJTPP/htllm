import type { SVGProps } from 'react';

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const p: SVGProps<SVGSVGElement> = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  if (name === 'chat')
    return (
      <svg {...p}>
        <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12Z" />
      </svg>
    );
  if (name === 'knowledge')
    return (
      <svg {...p}>
        <path d="M4 6c0-1.1 3-2 8-2s8 .9 8 2-3 2-8 2-8-.9-8-2Z" />
        <path d="M4 6v12c0 1.1 3 2 8 2s8-.9 8-2V6" />
        <path d="M4 12c0 1.1 3 2 8 2s8-.9 8-2" />
      </svg>
    );
  if (name === 'storage')
    return (
      <svg {...p}>
        <rect x="3" y="4" width="18" height="7" rx="1.5" />
        <rect x="3" y="13" width="18" height="7" rx="1.5" />
        <path d="M7 7.5h.01M7 16.5h.01" />
      </svg>
    );
  if (name === 'settings')
    return (
      <svg {...p}>
        <circle cx="12" cy="12" r="3.2" />
        <path d="M19 12a7 7 0 0 0-.1-1.3l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.3-1.3L13.7 2h-3.4l-.4 2.5a7 7 0 0 0-2.3 1.3l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .9.1 1.3l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2.3 1.3l.4 2.5h3.4l.4-2.5a7 7 0 0 0 2.3-1.3l2.3 1 2-3.4-2-1.5c.1-.4.1-.9.1-1.3Z" />
      </svg>
    );
  if (name === 'search')
    return (
      <svg {...p}>
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </svg>
    );
  if (name === 'info')
    return (
      <svg {...p}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </svg>
    );
  if (name === 'regen')
    return (
      <svg {...p}>
        <path d="M21 12a9 9 0 1 1-2.6-6.4" />
        <path d="M21 3v5h-5" />
      </svg>
    );
  if (name === 'image')
    return (
      <svg {...p}>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="9" cy="10" r="2" />
        <path d="m21 16-5-5L5 21" />
      </svg>
    );
  if (name === 'send')
    return (
      <svg {...p}>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    );
  if (name === 'plus')
    return (
      <svg {...p}>
        <path d="M12 5v14M5 12h14" />
      </svg>
    );
  if (name === 'trash')
    return (
      <svg {...p}>
        <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13" />
      </svg>
    );
  if (name === 'pencil')
    return (
      <svg {...p}>
        <path d="M12 20h9" />
        <path d="M16.4 3.6a2 2 0 1 1 2.8 2.8L7.5 18.1 3 19.5l1.4-4.5Z" />
      </svg>
    );
  if (name === 'doc')
    return (
      <svg {...p}>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
        <path d="M14 3v5h5" />
      </svg>
    );
  if (name === 'user')
    return (
      <svg {...p}>
        <circle cx="12" cy="8" r="3.4" />
        <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
      </svg>
    );
  if (name === 'fn')
    return (
      <svg {...p}>
        <path d="M5 21V7a3 3 0 0 1 3-3l3 0M5 12h7" />
        <path d="M9 17h3M14 21l4-10M21 11l-4 10" />
      </svg>
    );
  if (name === 'agent')
    return (
      <svg {...p}>
        <rect x="5" y="3" width="14" height="14" rx="2" />
        <circle cx="9" cy="10" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="15" cy="10" r="1.2" fill="currentColor" stroke="none" />
        <path d="M9 14h6M9 19l-2 2M15 19l2 2M12 17v4" />
      </svg>
    );
  if (name === 'artifact')
    return (
      <svg {...p}>
        <path d="M4 4h7l1 2h8v14H4z" />
        <path d="M4 10h16" />
      </svg>
    );
  if (name === 'vectormap')
    return (
      <svg {...p}>
        <circle cx="6" cy="6" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="18" cy="7" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="10" cy="12" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="16" cy="17" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="6" cy="18" r="1.4" fill="currentColor" stroke="none" />
        <path d="M6 6l4 6M18 7l-8 5M10 12l6 5M16 17l-10 1" opacity=".5" />
      </svg>
    );
  if (name === 'key')
    return (
      <svg {...p}>
        <path d="M14 7a4 4 0 1 1-4 4M7 14l-3 3v3h3v-3h3v-3M11 11l-4 3" />
      </svg>
    );
  if (name === 'server')
    return (
      <svg {...p}>
        <rect x="3" y="4" width="18" height="7" rx="1.5" />
        <rect x="3" y="13" width="18" height="7" rx="1.5" />
        <circle cx="7" cy="7.5" r=".8" fill="currentColor" stroke="none" />
        <circle cx="7" cy="16.5" r=".8" fill="currentColor" stroke="none" />
      </svg>
    );
  if (name === 'eye')
    return (
      <svg {...p}>
        <path d="M2 12c2.5-5 6-7 10-7s7.5 2 10 7c-2.5 5-6 7-10 7S4.5 17 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  if (name === 'eyeoff')
    return (
      <svg {...p}>
        <path d="M3 3l18 18M10.5 6.2A10 10 0 0 1 12 6c4 0 7.5 2.5 10 7-.7 1.3-1.5 2.4-2.3 3.3M6.4 8.3C4.4 9.6 2.7 11.5 2 14c2.5 4.5 6 7 10 7 1.4 0 2.7-.3 3.9-.8M9.5 9.5a3 3 0 0 0 4 4" />
      </svg>
    );
  if (name === 'copy')
    return (
      <svg {...p}>
        <rect x="9" y="9" width="11" height="11" rx="1" />
        <path d="M5 15V5a1 1 0 0 1 1-1h9" />
      </svg>
    );
  if (name === 'check')
    return (
      <svg {...p}>
        <path d="M5 12l4.5 4.5L19 7" />
      </svg>
    );
  if (name === 'warn')
    return (
      <svg {...p}>
        <path d="M12 3l10 18H2z" />
        <path d="M12 10v4M12 18v.01" />
      </svg>
    );
  if (name === 'external')
    return (
      <svg {...p}>
        <path d="M14 4h6v6M20 4l-9 9M9 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
      </svg>
    );
  if (name === 'stop')
    return (
      <svg {...p}>
        <rect x="6" y="6" width="12" height="12" rx="1" />
      </svg>
    );
  return null;
}
