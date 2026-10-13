/** Jumbo, the friendly elephant used in empty states and the logo. */
export function Mascot({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
      <ellipse cx="60" cy="108" rx="30" ry="5" fill="currentColor" className="text-brand-500/15" />
      {/* ears */}
      <ellipse cx="30" cy="52" rx="22" ry="26" fill="#b3edc8" />
      <ellipse cx="90" cy="52" rx="22" ry="26" fill="#b3edc8" />
      <ellipse cx="32" cy="54" rx="14" ry="18" fill="#7fdea5" />
      <ellipse cx="88" cy="54" rx="14" ry="18" fill="#7fdea5" />
      {/* head */}
      <circle cx="60" cy="52" r="28" fill="#2ead5b" />
      {/* trunk */}
      <path d="M60 66 C60 82 56 94 46 96 C40 97 38 92 42 90" stroke="#2ead5b" strokeWidth="12" fill="none" strokeLinecap="round" />
      {/* eyes */}
      <circle cx="50" cy="48" r="4.5" fill="#082815" />
      <circle cx="70" cy="48" r="4.5" fill="#082815" />
      <circle cx="51.5" cy="46.5" r="1.5" fill="#fff" />
      <circle cx="71.5" cy="46.5" r="1.5" fill="#fff" />
      {/* cheeks */}
      <circle cx="43" cy="58" r="4" fill="#ffb4c1" opacity="0.7" />
      <circle cx="77" cy="58" r="4" fill="#ffb4c1" opacity="0.7" />
      {/* tiny code brackets on the forehead */}
      <text x="60" y="36" textAnchor="middle" fontSize="11" fontWeight="700" fill="#d8f7e2" fontFamily="monospace">{'</>'}</text>
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <Mascot className="size-8" />
      <span className="font-display text-lg font-extrabold tracking-tight">Quadratic</span>
    </div>
  );
}
