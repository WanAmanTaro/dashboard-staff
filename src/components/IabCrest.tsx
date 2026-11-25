import React from 'react';

export const IabCrest: React.FC<{ className?: string }> = ({ className = 'w-10 h-10' }) => (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <rect x="4" y="4" width="56" height="56" rx="12" fill="#0B1F3B" />
    <rect x="6" y="6" width="52" height="52" rx="10" stroke="#C69738" strokeWidth="1.5" />
    <path
      d="M18 22L32 15L46 22V34C46 42.5 39.8 48.8 32 51C24.2 48.8 18 42.5 18 34V22Z"
      fill="#14325C"
      stroke="#C69738"
      strokeWidth="1.75"
    />
    <path d="M24 27H40M24 33H40M32 23V42" stroke="#F5D076" strokeWidth="1.75" strokeLinecap="round" />
    <circle cx="32" cy="19.5" r="2.2" fill="#C69738" />
  </svg>
);
