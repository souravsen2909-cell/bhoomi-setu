import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell } from "lucide-react";
import { getMyAlerts, markAlertRead, markAllAlertsRead } from "@/lib/alerts.functions";

const when = (value: string | null) =>
  value ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "";

export function AlertsBell() {
  const fetchAlerts = useServerFn(getMyAlerts);
  const readOne = useServerFn(markAlertRead);
  const readAll = useServerFn(markAllAlertsRead);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement | null>(null);

  const query = useQuery({
    queryKey: ["my-alerts"],
    queryFn: () => fetchAlerts({}),
    refetchInterval: 60_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["my-alerts"] });

  const markOne = useMutation({
    mutationFn: (alertId: string) => readOne({ data: { alertId } }),
    onSuccess: invalidate,
  });
  const markAll = useMutation({
    mutationFn: () => readAll({}),
    onSuccess: invalidate,
  });

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapper.current && !wrapper.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const alerts = query.data?.alerts ?? [];
  const unread = query.data?.unread ?? 0;

  return (
    <div className="relative" ref={wrapper}>
      <button
        type="button"
        aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border text-foreground transition-colors hover:bg-muted"
      >
        <Bell className="h-4 w-4" aria-hidden />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-destructive px-1 text-center text-[11px] font-semibold leading-5 text-destructive-foreground">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-40 w-80 surface p-2 shadow-lg">
          <div className="flex items-center justify-between px-2 py-1">
            <p className="text-sm font-medium text-card-foreground">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
                className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {query.isLoading ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">Loading…</p>
            ) : alerts.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">Nothing new yet.</p>
            ) : (
              <ul className="space-y-1">
                {alerts.map((a) => (
                  <li key={a.id} className={`rounded-lg px-2 py-2 ${a.read_at ? "" : "bg-muted"}`}>
                    <p className="text-sm text-card-foreground">{a.message}</p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        {when(a.created_at ?? a.sent_at)}
                      </span>
                      {!a.read_at && (
                        <button
                          type="button"
                          onClick={() => markOne.mutate(a.id)}
                          disabled={markOne.isPending}
                          className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
                        >
                          Mark as read
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default AlertsBell;
