"use client";

export function LM3DLogo() {
  return (
    <svg
      className="w-16 h-16 mx-auto mb-6 animate-pulse"
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          id="lmGradient"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <stop offset="0%" stopColor="#00d4ff" />
          <stop offset="50%" stopColor="#0ea5e9" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
        <filter id="glowEffect" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <path
        d="M 50 10 L 85 30 L 85 70 L 50 90 L 15 70 L 15 30 Z"
        stroke="#00d4ff"
        strokeWidth="2"
        fill="none"
        opacity="0.5"
        filter="url(#glowEffect)"
      />

      <path
        d="M 50 12 L 83 30 L 83 70 L 50 88 L 17 70 L 17 30 Z"
        fill="url(#lmGradient)"
        opacity="0.1"
        filter="url(#glowEffect)"
      />

      <g filter="url(#glowEffect)">
        <rect x="28" y="30" width="6" height="36" fill="url(#lmGradient)" rx="2" />
        <rect x="28" y="64" width="16" height="4" fill="url(#lmGradient)" rx="2" />
      </g>

      <g filter="url(#glowEffect)">
        <rect x="54" y="30" width="6" height="36" fill="url(#lmGradient)" rx="2" />
        <polygon
          points="60,30 66,45 72,30 72,66 66,66 66,45 60,66 54,66"
          fill="url(#lmGradient)"
        />
      </g>

      <circle cx="20" cy="25" r="1.5" fill="#00d4ff" opacity="0.8" filter="url(#glowEffect)" />
      <circle cx="80" cy="50" r="1.5" fill="#00d4ff" opacity="0.8" filter="url(#glowEffect)" />
      <circle cx="50" cy="92" r="1.5" fill="#00d4ff" opacity="0.8" filter="url(#glowEffect)" />
    </svg>
  );
}
