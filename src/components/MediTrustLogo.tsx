interface MediTrustLogoProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'dark' | 'light';
  showWordmark?: boolean;
  className?: string;
}

const SIZE_MAP = {
  sm: { box: 'w-7 h-7', text: 'text-base' },
  md: { box: 'w-8 h-8', text: 'text-lg' },
  lg: { box: 'w-10 h-10', text: 'text-xl' },
};

export function MediTrustIcon({
  className = 'w-8 h-8',
  variant = 'dark',
}: {
  className?: string;
  variant?: 'dark' | 'light';
}) {
  const bg = variant === 'light' ? '#FFFFFF' : '#0B1B2B';
  const shieldFill = variant === 'light' ? '#0D7377' : '#0D7377';
  const shieldStroke = variant === 'light' ? '#0D7377' : '#2DD4BF';
  const crossColor = variant === 'light' ? '#0B1B2B' : '#FFFFFF';
  const checkColor = variant === 'light' ? '#0D7377' : '#2DD4BF';

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect width="64" height="64" rx="15" fill={bg} />
      <path
        d="M32 10.5L49.5 17.8V31.4C49.5 42.9 42 51.4 32 54.5C22 51.4 14.5 42.9 14.5 31.4V17.8L32 10.5Z"
        fill={shieldFill}
        fillOpacity={variant === 'light' ? '0.14' : '0.26'}
        stroke={shieldStroke}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M32 21V40.5M22.25 30.75H41.75"
        stroke={crossColor}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M40.5 42.5L44.8 46.8L53.2 38.4"
        stroke={checkColor}
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MediTrustLogo({
  size = 'md',
  variant = 'dark',
  showWordmark = true,
  className = '',
}: MediTrustLogoProps) {
  const dims = SIZE_MAP[size];
  return (
    <span className={`inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 ${className}`}>
      <MediTrustIcon className={`${dims.box} shrink-0`} variant={variant} />
      {showWordmark && (
        <span
          className={`font-display font-bold tracking-tight ${dims.text} ${
            variant === 'light' ? 'text-white' : 'text-[#0B1B2B]'
          }`}
        >
          MediTrust <span className={variant === 'light' ? 'text-teal-300' : 'text-[#0D7377]'}>AI</span>
        </span>
      )}
    </span>
  );
}
