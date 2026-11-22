export function Logo({ size = 26 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden
        className="flex-none"
      >
        <rect width="32" height="32" rx="9" fill="#141414" />
        <path
          d="M9 21.5V10.5c0-.55.45-1 1-1h4.4c2.6 0 4.1 1.25 4.1 3.4 0 1.7-.85 2.75-2.3 3.12l3.1 5.28c.3.5-.07 1.2-.66 1.2h-2.1a1 1 0 0 1-.86-.5l-2.74-4.72h-1.9v4.22c0 .55-.45 1-1 1H9.9a1 1 0 0 1-.9-1Z"
          fill="#fff"
        />
      </svg>
      <span className="font-semibold tracking-tight text-[17px]">Pachat</span>
    </span>
  );
}
