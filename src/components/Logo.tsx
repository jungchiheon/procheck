// 3-1 ProCheck Logo (light): shield + check + gradient wordmark
export default function Logo({ size=40, withWord=true }: { size?: number; withWord?: boolean }) {
  return (
    <div className="flex items-center gap-2 select-none">
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4E8BFF" />
            <stop offset="60%" stopColor="#8B5CF6" />
            <stop offset="100%" stopColor="#22C55E" />
          </linearGradient>
        </defs>
        <path d="M32 6l18 8v12c0 12.15-7.38 22.9-18 26-10.62-3.1-18-13.85-18-26V14l18-8z"
              fill="url(#g1)" opacity="0.17" />
        <path d="M32 6l18 8v12c0 12.15-7.38 22.9-18 26-10.62-3.1-18-13.85-18-26V14l18-8z"
              stroke="url(#g1)" strokeWidth="2" fill="none"/>
        <path d="M23 33l7 7 12-14" stroke="url(#g1)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      {withWord && <span className="text-lg font-semibold grad-text">ProCheck</span>}
    </div>
  );
}
