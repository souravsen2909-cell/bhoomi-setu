const LEGEND = [
  { label: "Identified", className: "bg-status-identified" },
  { label: "Notified", className: "bg-status-notified" },
  { label: "Award declared", className: "bg-status-award" },
  { label: "Possession taken", className: "bg-status-possession" },
  { label: "Disputed", className: "bg-status-disputed" },
];

export function MapLegend({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "" : "surface p-4"}>
      <p className="eyebrow">Parcel status</p>
      <ul className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
        {LEGEND.map((item) => (
          <li key={item.label} className="flex items-center gap-2 text-xs sm:text-sm">
            <span
              className={`inline-block size-3 shrink-0 rounded-sm ${item.className}`}
              aria-hidden="true"
            />
            <span className="truncate text-card-foreground">{item.label}</span>
          </li>
        ))}
        <li className="flex items-center gap-2 text-xs sm:text-sm">
          <span
            className="inline-block h-1 w-5 shrink-0 rounded-full bg-route-line"
            aria-hidden="true"
          />
          <span className="truncate text-card-foreground">Highway route</span>
        </li>
      </ul>
    </div>
  );
}

export function MapLegendStack() {
  return (
    <div className="surface p-3 sm:p-4">
      <p className="eyebrow">Parcel status</p>
      <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-1 sm:gap-y-2">
        {LEGEND.map((item) => (
          <li key={item.label} className="flex items-center gap-2 text-xs sm:text-sm">
            <span
              className={`inline-block size-3 shrink-0 rounded-sm ${item.className}`}
              aria-hidden="true"
            />
            <span className="truncate text-card-foreground">{item.label}</span>
          </li>
        ))}
        <li className="flex items-center gap-2 text-xs sm:text-sm">
          <span
            className="inline-block h-1 w-5 shrink-0 rounded-full bg-route-line"
            aria-hidden="true"
          />
          <span className="truncate text-card-foreground">Highway route</span>
        </li>
      </ul>
    </div>
  );
}
