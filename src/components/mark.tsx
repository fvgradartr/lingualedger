export function Mark({ className = "size-7" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="32" height="32" fill="#12100E" />
      <rect x="7" y="7" width="6.2" height="18" fill="#F3EBDD" />
      <rect x="16.6" y="7" width="6.2" height="18" fill="#F3EBDD" />
      <path d="M5 16.1h20.4" stroke="#C4845A" strokeWidth="1.7" />
      <path d="M21.4 12.4 26.6 16.1 21.4 19.8" stroke="#C4845A" strokeWidth="1.7" strokeLinejoin="miter" />
    </svg>
  );
}
