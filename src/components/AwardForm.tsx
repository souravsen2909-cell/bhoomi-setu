import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bell, Check, Copy, ExternalLink, Mail, MessageSquare, ShieldCheck } from "lucide-react";
import {
  computeCompensation,
  createAward,
  deleteAward,
  getAwardParcels,
  updateAward,
  type LandType,
} from "@/lib/awards.functions";

const num = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);

const formatDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";
const labelClass = "block text-sm font-medium text-foreground";

type IssuedDetails = {
  email: string;
  password?: string;
  projectName?: string;
  sector?: string | null;
  requiringBody?: string | null;
  surveyNumber?: string;
  areaHectares?: number | null;
  declaredAmount?: number;
  notificationMessage?: string;
  notifiedAt?: string;
};

export function AwardForm({ projectId }: { projectId: string }) {
  const fetchParcels = useServerFn(getAwardParcels);
  const saveAward = useServerFn(createAward);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["award-parcels", projectId],
    queryFn: () => fetchParcels({ data: { projectId } }),
  });
  const parcels = query.data?.parcels ?? [];
  const awards = query.data?.awards ?? [];

  const [parcelId, setParcelId] = useState("");
  const [amount, setAmount] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [issued, setIssued] = useState<IssuedDetails | null>(null);
  const [copiedCreds, setCopiedCreds] = useState(false);

  // Compensation calculator
  const [area, setArea] = useState("");
  const [landType, setLandType] = useState<LandType>("rural");
  const [circleRate, setCircleRate] = useState("");
  const [assetValue, setAssetValue] = useState("");

  const selected = parcels.find((p) => p.id === parcelId) ?? null;

  // Prefill the area from the chosen parcel.
  useEffect(() => {
    if (selected?.area_hectares != null) setArea(String(selected.area_hectares));
  }, [selected?.id, selected?.area_hectares]);

  const calc = useMemo(
    () =>
      computeCompensation({
        areaHectares: num(area),
        circleRatePerHectare: num(circleRate),
        landType,
        assetValue: num(assetValue),
      }),
    [area, circleRate, landType, assetValue],
  );

  const finalAmount = amount === "" ? Math.round(calc.total) : num(amount);

  const mutation = useMutation({
    mutationFn: () =>
      saveAward({
        data: {
          projectId,
          parcelId,
          declaredAmount: finalAmount,
          landownerEmail: email,
          landownerPassword: password,
        },
      }),
    onSuccess: (result) => {
      toast.success("Award declared and notification dispatched to landowner!");
      setParcelId("");
      setAmount("");
      setEmail("");
      setPassword("");
      setCircleRate("");
      setAssetValue("");

      setIssued({
        email: result.email,
        password: result.password || undefined,
        projectName: result.projectName,
        sector: result.sector,
        requiringBody: result.requiringBody,
        surveyNumber: result.surveyNumber,
        areaHectares: result.areaHectares,
        declaredAmount: result.declaredAmount,
        notificationMessage: result.notificationMessage,
        notifiedAt: result.notifiedAt,
      });

      queryClient.invalidateQueries({ queryKey: ["award-parcels", projectId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["my-alerts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function copyIssuedDetails() {
    if (!issued) return;
    const text =
      `BHOOMI SETU: PROJECT & AWARD REGISTRATION\n` +
      `-----------------------------------------\n` +
      `Project: ${issued.projectName ?? "Land Acquisition"}\n` +
      `Survey Number: ${issued.surveyNumber ?? "—"}\n` +
      `Area: ${issued.areaHectares != null ? `${issued.areaHectares} ha` : "—"}\n` +
      `Declared Compensation: ${money(issued.declaredAmount ?? 0)}\n\n` +
      `LANDOWNER LOGIN CREDENTIALS:\n` +
      `Email: ${issued.email}\n` +
      `Password: ${issued.password ?? "(Set by user/officer)"}\n` +
      `Portal Link: ${window.location.origin}/auth\n\n` +
      `Notification status: Registered in Bhoomi Setu register.`;

    navigator.clipboard.writeText(text);
    setCopiedCreds(true);
    toast.success("Credentials and project details copied!");
    setTimeout(() => setCopiedCreds(false), 2500);
  }

  function shareViaWhatsApp() {
    if (!issued) return;
    const text = encodeURIComponent(
      `Bhoomi Setu Notice: Your land (Survey No. ${issued.surveyNumber}) has been registered under project "${issued.projectName}". Declared compensation: ${money(issued.declaredAmount ?? 0)}. Login to portal with Email: ${issued.email} Password: ${issued.password ?? "your chosen password"} at ${window.location.origin}/auth`,
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank", "noopener,noreferrer");
  }

  function shareViaEmail() {
    if (!issued) return;
    const subject = encodeURIComponent(
      `Bhoomi Setu: Project & Award Details for Survey No. ${issued.surveyNumber}`,
    );
    const body = encodeURIComponent(
      `Dear Landowner,\n\nYour land (Survey No. ${issued.surveyNumber}, ${issued.areaHectares ?? ""} ha) is registered under project "${issued.projectName}".\n\nDeclared Compensation: ${money(issued.declaredAmount ?? 0)}\nPortal Login Email: ${issued.email}\nPassword: ${issued.password ?? "(Configured)"}\n\nSign in to track disbursement: ${window.location.origin}/auth`,
    );
    window.location.href = `mailto:${issued.email}?subject=${subject}&body=${body}`;
  }

  return (
    <section className="mt-6 rounded-xl border border-border bg-muted/30 p-5">
      <h3 className="text-sm font-semibold text-card-foreground">Declare an award</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Work out the compensation below or type the amount straight in, and add the landowner’s
        email. A login is created on that email so the landowner can track the award and payment.
      </p>

      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!parcelId) {
            toast.error("Choose a parcel");
            return;
          }
          if (!(finalAmount > 0)) {
            toast.error("Enter an amount greater than zero");
            return;
          }
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            toast.error("Enter a valid landowner email address");
            return;
          }
          if (password.trim() !== "" && password.trim().length < 8) {
            toast.error("The password must be at least 8 characters");
            return;
          }
          mutation.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={labelClass} htmlFor={`parcel-${projectId}`}>
              Parcel
            </label>
            <select
              id={`parcel-${projectId}`}
              className={`${field} mt-1`}
              value={parcelId}
              onChange={(e) => setParcelId(e.target.value)}
            >
              <option value="">
                {query.isLoading
                  ? "Loading parcels…"
                  : parcels.length === 0
                    ? "No parcels in this project"
                    : "Select a parcel"}
              </option>
              {parcels.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.survey_number}
                  {p.area_hectares != null ? ` — ${p.area_hectares} ha` : ""}
                  {p.award_count > 0 ? " (award exists)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor={`amount-${projectId}`}>
              Amount to be declared (₹)
            </label>
            <input
              id={`amount-${projectId}`}
              type="number"
              step="1"
              min="0"
              className={`${field} mt-1`}
              value={amount === "" ? String(Math.round(calc.total)) : amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {amount === ""
                ? "Taken from the calculator below."
                : "Overriding the calculated total."}
            </p>
          </div>
          <div>
            <label className={labelClass} htmlFor={`email-${projectId}`}>
              Landowner email
            </label>
            <input
              id={`email-${projectId}`}
              type="email"
              required
              className={`${field} mt-1`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@example.com"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor={`pw-${projectId}`}>
              Landowner password (optional)
            </label>
            <input
              id={`pw-${projectId}`}
              type="text"
              className={`${field} mt-1`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Leave blank and a temporary password is generated for you.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h4 className="text-sm font-medium text-card-foreground">Compensation calculator</h4>

          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor={`area-${projectId}`}>
                Area (hectares)
              </label>
              <input
                id={`area-${projectId}`}
                type="number"
                step="0.0001"
                min="0"
                className={`${field} mt-1`}
                value={area}
                onChange={(e) => setArea(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor={`landtype-${projectId}`}>
                Land type
              </label>
              <select
                id={`landtype-${projectId}`}
                className={`${field} mt-1`}
                value={landType}
                onChange={(e) => setLandType(e.target.value as LandType)}
              >
                <option value="urban">Urban (multiplier 1)</option>
                <option value="rural">Rural (multiplier 2)</option>
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor={`rate-${projectId}`}>
                Circle rate per hectare (₹)
              </label>
              <input
                id={`rate-${projectId}`}
                type="number"
                step="1"
                min="0"
                className={`${field} mt-1`}
                value={circleRate}
                onChange={(e) => setCircleRate(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor={`asset-${projectId}`}>
                Value of assets on land (₹)
              </label>
              <input
                id={`asset-${projectId}`}
                type="number"
                step="1"
                min="0"
                className={`${field} mt-1`}
                value={assetValue}
                onChange={(e) => setAssetValue(e.target.value)}
              />
            </div>
          </div>

          <dl className="mt-4 space-y-1 text-sm">
            <Row
              label={`Land value (${area || 0} ha × rate × ${calc.multiplier})`}
              value={money(calc.land)}
            />
            <Row label="Plus assets" value={money(num(assetValue))} />
            <Row label="Subtotal" value={money(calc.base)} />
            <Row label="Solatium (100%)" value={money(calc.solatium)} />
            <div className="flex items-center justify-between border-t border-border pt-2 text-base font-semibold text-card-foreground">
              <dt>Calculated total</dt>
              <dd>{money(calc.total)}</dd>
            </div>
          </dl>

          {amount !== "" ? (
            <button
              type="button"
              onClick={() => setAmount("")}
              className="mt-3 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground"
            >
              Use calculated total
            </button>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {mutation.isPending ? "Saving…" : "Save award"}
        </button>
      </form>

      {issued ? (
        <div className="mt-4 rounded-lg border border-gold/50 bg-gold/10 p-3 text-sm text-card-foreground">
          Login ready for <span className="font-semibold">{issued.email}</span> with the password{" "}
          <span className="font-mono font-semibold">{issued.password}</span>. Share it with the
          landowner — it is shown only once. They also get a notice in their portal saying their
          land is under acquisition.
        </div>
      ) : null}

      <div className="mt-6 border-t border-border pt-5">
        <h4 className="text-sm font-semibold text-card-foreground">Awards already declared</h4>
        {query.isLoading ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading awards…</p>
        ) : awards.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No awards declared for this project yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {awards.map((a) => (
              <AwardRow key={a.id} projectId={projectId} award={a} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function AwardRow({
  projectId,
  award,
}: {
  projectId: string;
  award: {
    id: string;
    survey_number: string;
    declared_amount: number;
    declared_date: string | null;
    landowner_email: string | null;
  };
}) {
  const save = useServerFn(updateAward);
  const remove = useServerFn(deleteAward);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(Math.round(award.declared_amount)));

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["award-parcels", projectId] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const mutation = useMutation({
    mutationFn: () =>
      save({ data: { projectId, awardId: award.id, declaredAmount: Number(value) } }),
    onSuccess: () => {
      toast.success("Award amount updated");
      setEditing(false);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deletion = useMutation({
    mutationFn: () => remove({ data: { projectId, awardId: award.id } }),
    onSuccess: () => {
      toast.success("Award deleted");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <li className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-card-foreground">
            Survey no. {award.survey_number} · {money(award.declared_amount)}
          </p>
          <p className="text-xs text-muted-foreground">
            Declared {formatDate(award.declared_date)}
            {award.landowner_email ? ` · ${award.landowner_email}` : ""}
          </p>
        </div>
        {editing ? (
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step="1"
              className="w-36 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <button
              type="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground"
            >
              Edit amount
            </button>
            <button
              type="button"
              disabled={deletion.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `Delete the declared amount for survey no. ${award.survey_number}? This cannot be undone.`,
                  )
                )
                  deletion.mutate();
              }}
              className="rounded-lg border border-destructive px-3 py-1.5 text-sm font-medium text-destructive disabled:opacity-50"
            >
              {deletion.isPending ? "Deleting…" : "Delete"}
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <dt>{label}</dt>
      <dd className="text-card-foreground">{value}</dd>
    </div>
  );
}

export default AwardForm;
