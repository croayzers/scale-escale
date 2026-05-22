"use client";

type PlanCode = "free_lite" | "pro" | "premium";

const PLAN_STYLES: Record<PlanCode, string> = {
  free_lite: "border-zinc-200 bg-white text-zinc-700",
  pro: "border-sky-200 bg-sky-50 text-sky-700",
  premium: "border-violet-200 bg-violet-50 text-violet-700",
};

const PLAN_LABELS: Record<PlanCode, string> = {
  free_lite: "Version Lite",
  pro: "Version PRO",
  premium: "Version Premium",
};

type PlanBadgeProps = {
  plan: PlanCode;
  className?: string;
};

export function PlanBadge({ plan, className = "" }: PlanBadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]",
        PLAN_STYLES[plan],
        className,
      ].join(" ")}
    >
      {PLAN_LABELS[plan]}
    </span>
  );
}
