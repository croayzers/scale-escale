"use client";

import { useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase-browser";

type PlanCode = "free_lite" | "pro" | "premium";
type Provider = "google" | "azure" | "email";

type LoginResult = {
  email: string;
  plan: PlanCode;
  provider: Provider;
  mode: "lite" | "email_lookup" | "oauth_redirect" | "oauth_not_configured";
};

type LoginProps = {
  onLiteLeadCaptured?: (email: string) => Promise<void> | void;
  onEmailLookup?: (email: string, plan: Exclude<PlanCode, "free_lite">) => Promise<void> | void;
  onResolved?: (result: LoginResult) => Promise<void> | void;
  defaultPlan?: PlanCode;
};

const PLAN_COPY: Record<
  PlanCode,
  { name: string; price: string; points: string[] }
> = {
  free_lite: {
    name: "Lite",
    price: "0 €",
    points: [
      "Particulares y pruebas",
      "Marca E_scale visible",
      "Diseño del evento",
      "Catálogo básico",
      "Sin exportación PDF",
    ],
  },
  pro: {
    name: "PRO",
    price: "34 €",
    points: [
      "Logo propio",
      "PDF profesional",
      "Excel de proveedores",
      "Envío del PDF al usuario",
      "Uso freelance",
    ],
  },
  premium: {
    name: "Premium",
    price: "120 €",
    points: [
      "CRM / ERP / SharePoint",
      "PDF al cliente final",
      "Reportes empresariales",
      "Integraciones avanzadas",
      "Pensado para empresa",
    ],
  },
};

function cleanEmail(value: string) {
  return value.trim().toLowerCase();
}

export default function Login({
  onLiteLeadCaptured,
  onEmailLookup,
  onResolved,
  defaultPlan = "free_lite",
}: LoginProps) {
  const [email, setEmail] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<PlanCode>(defaultPlan);
  const [busyProvider, setBusyProvider] = useState<Provider | null>(null);
  const [message, setMessage] = useState("");

  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const oauthEnabled = Boolean(supabase);

  const redirectTo = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/dashboard`;
  }, []);

  async function notifyResolved(result: LoginResult) {
    await onResolved?.(result);
  }

  async function handleLiteContinue() {
    const normalizedEmail = cleanEmail(email);
    if (!normalizedEmail) {
      setMessage("Necesitas escribir un correo para continuar con Lite.");
      return;
    }

    setBusyProvider("email");
    setMessage("");

    try {
      await onLiteLeadCaptured?.(normalizedEmail);
      await notifyResolved({
        email: normalizedEmail,
        plan: "free_lite",
        provider: "email",
        mode: "lite",
      });
      setMessage("Correo registrado. Ya puedes continuar con la app en modo Lite.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo registrar el correo.");
    } finally {
      setBusyProvider(null);
    }
  }

  async function handleEmailLookup() {
    const normalizedEmail = cleanEmail(email);
    if (!normalizedEmail) {
      setMessage("Necesitas escribir un correo para verificar tu licencia.");
      return;
    }

    if (selectedPlan === "free_lite") {
      await handleLiteContinue();
      return;
    }

    setBusyProvider("email");
    setMessage("");

    try {
      await onEmailLookup?.(normalizedEmail, selectedPlan);
      await notifyResolved({
        email: normalizedEmail,
        plan: selectedPlan,
        provider: "email",
        mode: "email_lookup",
      });
      setMessage("Correo enviado al verificador de licencias.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo verificar el correo.");
    } finally {
      setBusyProvider(null);
    }
  }

  async function handleOAuth(provider: "google" | "azure") {
    const normalizedEmail = cleanEmail(email);
    if (!normalizedEmail) {
      setMessage("Escribe primero el correo con el que compraste la licencia.");
      return;
    }

    if (selectedPlan === "free_lite") {
      await handleLiteContinue();
      return;
    }

    setBusyProvider(provider);
    setMessage("");

    try {
      if (!supabase) {
        await notifyResolved({
          email: normalizedEmail,
          plan: selectedPlan,
          provider,
          mode: "oauth_not_configured",
        });
        setMessage("Supabase OAuth todavía no está configurado. La UI sigue funcionando y podrás añadir las keys después.");
        return;
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: provider === "google"
          ? {
              redirectTo,
            }
          : {
              scopes: "email",
              redirectTo,
            },
      });

      if (error) throw error;

      await notifyResolved({
        email: normalizedEmail,
        plan: selectedPlan,
        provider,
        mode: "oauth_redirect",
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo iniciar OAuth.");
    } finally {
      setBusyProvider(null);
    }
  }

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-8 rounded-[32px] border border-zinc-200 bg-white p-6 shadow-sm md:p-10">
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="grid gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">
              Login
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">
              Accede y deja que la app resuelva tu licencia
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
              Si eliges Lite, guardamos el correo para seguimiento comercial y continúas.
              Si eliges PRO o Premium, verificamos la identidad con ese correo y después
              desbloqueas la suscripción real.
            </p>
          </div>

          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Correo
            </span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="tu@empresa.com"
              className="h-12 rounded-2xl border border-zinc-200 px-4 text-sm text-zinc-900 outline-none transition focus:border-zinc-400"
            />
          </label>

          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => void handleOAuth("google")}
              disabled={busyProvider !== null}
              className="inline-flex h-12 items-center justify-center gap-3 rounded-2xl border border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-800 transition hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="text-lg">G</span>
              Continuar con Google
            </button>

            <button
              type="button"
              onClick={() => void handleOAuth("azure")}
              disabled={busyProvider !== null}
              className="inline-flex h-12 items-center justify-center gap-3 rounded-2xl border border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-800 transition hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="text-lg">M</span>
              Continuar con Microsoft
            </button>

            <button
              type="button"
              onClick={() => void handleEmailLookup()}
              disabled={busyProvider !== null}
              className="inline-flex h-12 items-center justify-center gap-3 rounded-2xl border border-zinc-900 bg-zinc-900 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Continuar con correo
            </button>
          </div>

          <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-3 text-xs leading-6 text-zinc-600">
            <strong className="font-semibold text-zinc-900">Redirect OAuth:</strong>{" "}
            <code>/dashboard</code>.
            {!oauthEnabled && (
              <>
                {" "}
                No hay claves públicas de Supabase todavía, así que el componente entra en modo seguro y no rompe la app.
              </>
            )}
          </div>

          {message ? (
            <p className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
              {message}
            </p>
          ) : null}
        </div>

        <div className="rounded-[28px] border border-zinc-200 bg-zinc-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
            Plan seleccionado
          </p>
          <div className="mt-4 grid gap-3">
            {(Object.keys(PLAN_COPY) as PlanCode[]).map((plan) => {
              const selected = plan === selectedPlan;
              const planInfo = PLAN_COPY[plan];

              return (
                <button
                  key={plan}
                  type="button"
                  onClick={() => setSelectedPlan(plan)}
                  className={[
                    "grid gap-3 rounded-3xl border px-5 py-4 text-left transition",
                    selected
                      ? "border-zinc-900 bg-white shadow-sm"
                      : "border-zinc-200 bg-white/70 hover:border-zinc-300",
                  ].join(" ")}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-xl font-semibold text-zinc-900">
                      {planInfo.name}
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
                      {planInfo.price}
                    </span>
                  </div>
                  <p className="text-xs leading-5 text-zinc-600">
                    {plan === "free_lite"
                      ? "Entra directo, registra el correo y sigue usando la app."
                      : "Requiere verificar identidad con el correo asociado a la licencia."}
                  </p>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => void handleLiteContinue()}
            disabled={busyProvider !== null || selectedPlan !== "free_lite"}
            className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 transition hover:border-zinc-300 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Continuar con Lite
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {(Object.keys(PLAN_COPY) as PlanCode[]).map((plan) => {
          const planInfo = PLAN_COPY[plan];
          return (
            <article
              key={plan}
              className={[
                "rounded-[28px] border p-5",
                plan === "pro"
                  ? "border-sky-200 bg-sky-50"
                  : "border-zinc-200 bg-white",
              ].join(" ")}
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-2xl font-semibold text-zinc-900">{planInfo.name}</h2>
                <span className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
                  {planInfo.price}
                </span>
              </div>
              <ul className="mt-4 grid gap-2 text-sm leading-6 text-zinc-600">
                {planInfo.points.map((point) => (
                  <li key={point}>• {point}</li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}
