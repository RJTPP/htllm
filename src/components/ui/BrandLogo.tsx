export function BrandLogo({ brand, size = 18 }: { brand: string | null; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24' };
  if (brand === 'meta') {
    return (
      <svg {...p}>
        <path
          d="M12 12C9 7.5 6.4 6.6 4.8 7.4 2.6 8.5 2.4 12.4 4 14.8c1.4 2.1 3.6 2 5-.2 1.1-1.7 2-3.4 3-5.2-1 2 .2 4.6 1.6 6.4 1.7 2.2 4.3 2 5.6-.4 1.4-2.7.9-6.5-1.4-7.6C20.3 6.3 17.2 7.3 12 12Z"
          fill="#0866FF"
        />
      </svg>
    );
  }
  if (brand === 'microsoft') {
    return (
      <svg {...p}>
        <rect x="3" y="3" width="8.4" height="8.4" fill="#F25022" />
        <rect x="12.6" y="3" width="8.4" height="8.4" fill="#7FBA00" />
        <rect x="3" y="12.6" width="8.4" height="8.4" fill="#00A4EF" />
        <rect x="12.6" y="12.6" width="8.4" height="8.4" fill="#FFB900" />
      </svg>
    );
  }
  if (brand === 'google') {
    return (
      <svg {...p} fill="none">
        <path d="M12 4A8 8 0 0 1 20 12" stroke="#4285F4" strokeWidth="4" />
        <path d="M20 12A8 8 0 0 1 12 20" stroke="#34A853" strokeWidth="4" />
        <path d="M12 20A8 8 0 0 1 4 12" stroke="#FBBC05" strokeWidth="4" />
        <path d="M4 12A8 8 0 0 1 12 4" stroke="#EA4335" strokeWidth="4" />
        <path d="M12 12H21" stroke="#4285F4" strokeWidth="4" />
      </svg>
    );
  }
  if (brand === 'mistral') {
    return (
      <svg {...p}>
        <rect x="3" y="4" width="18" height="4" fill="#FFD800" />
        <rect x="3" y="9" width="18" height="4" fill="#FF9D00" />
        <rect x="3" y="14" width="18" height="4" fill="#FF6B2C" />
        <rect x="3" y="19" width="18" height="3" fill="#EA2D0F" />
      </svg>
    );
  }
  if (brand === 'hf') {
    return (
      <svg {...p}>
        <circle cx="12" cy="12" r="9" fill="#FFD21E" />
        <circle cx="9" cy="10.6" r="1.5" fill="#2A2113" />
        <circle cx="15" cy="10.6" r="1.5" fill="#2A2113" />
        <path
          d="M8.6 14.4C9.8 16.3 14.2 16.3 15.4 14.4"
          stroke="#2A2113"
          strokeWidth="1.7"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    );
  }
  if (brand === 'qwen') {
    return (
      <svg {...p}>
        <circle cx="12" cy="12" r="9.5" fill="#615CED" />
        <path
          d="M8 8.5L12 15L16 8.5"
          stroke="#fff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          d="M9 13L12 17.6L15 13"
          stroke="#fff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity="0.5"
        />
      </svg>
    );
  }
  if (brand === 'deepseek') {
    return (
      <svg {...p}>
        <circle cx="12" cy="12" r="9.5" fill="#4D6BFE" />
        <path
          d="M6 13.5C9 9 10.5 9 12 12C13.5 15 15 15 18 10.5"
          stroke="#fff"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    );
  }
  if (brand === 'snowflake') {
    return (
      <svg {...p}>
        <rect x="2" y="2" width="20" height="20" rx="4" fill="#29B5E8" />
        <g stroke="#fff" strokeWidth="1.5" strokeLinecap="round">
          <path d="M12 5v14M5 12h14M7 7l10 10M17 7L7 17" />
        </g>
      </svg>
    );
  }
  if (brand === 'bge') {
    return (
      <svg {...p}>
        <rect x="2" y="2" width="20" height="20" rx="4" fill="#0EA5E9" />
        <text
          x="12"
          y="16"
          textAnchor="middle"
          fontSize="9"
          fontFamily="ui-monospace, monospace"
          fill="#fff"
          fontWeight="700"
        >
          BGE
        </text>
      </svg>
    );
  }
  return (
    <svg {...p}>
      <rect x="3" y="3" width="18" height="18" rx="5" fill="#404040" />
    </svg>
  );
}
