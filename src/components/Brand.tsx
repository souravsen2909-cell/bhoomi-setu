export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg brand-gradient text-primary-foreground shadow-card ${className}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M3 19.5 9 5l6 14.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13.5 12h7.5" strokeLinecap="round" />
        <path d="M17 8.5h4" strokeLinecap="round" />
        <path d="M17 15.5h4" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function BrandLockup({
  tone = "light",
  subtitle = "Land Acquisition Register",
}: {
  tone?: "light" | "dark";
  subtitle?: string;
}) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <BrandMark />
      <span className="min-w-0 leading-tight">
        <span
          className={`block truncate font-display text-sm font-semibold tracking-tight ${
            tone === "dark" ? "text-sidebar-foreground" : "text-foreground"
          }`}
        >
          Bhoomi Setu
        </span>
        <span
          className={`block truncate text-[0.7rem] ${
            tone === "dark" ? "text-sidebar-foreground/60" : "text-muted-foreground"
          }`}
        >
          {subtitle}
        </span>
      </span>
    </span>
  );
}
