import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  fetchCalorieTrend,
  fetchGoalComparison,
  fetchMacroTrend,
  fetchMicronutrients,
} from "../features/reports/reportsApi";
import type { GoalMetric, ReportPeriod, ReportRange, ReportView } from "../types/report";
import { getApiErrorMessage } from "../utils/apiError";

type RangeChoice = "global" | ReportPeriod | "custom";
type LocalRange = { choice: RangeChoice; startDate: string; endDate: string };
type GoalRingDatum = {
  name: string;
  actual: number;
  target: number;
  unit: string;
  percentage: number;
  rawPercentage: number;
  fill: string;
  overTarget: boolean;
};

const presets: Array<{ value: ReportPeriod; label: string }> = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

function localDate(value = new Date()): string {
  const adjusted = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 10);
}

function presetDates(period: ReportPeriod): Pick<LocalRange, "startDate" | "endDate"> {
  const days = { "7d": 7, "30d": 30, "90d": 90 }[period];
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days + 1);
  return { startDate: localDate(start), endDate: localDate(end) };
}

function initialRange(choice: RangeChoice = "global"): LocalRange {
  return { choice, ...presetDates("7d") };
}

function resolvedRange(range: LocalRange, globalRange: LocalRange): ReportRange {
  const selected = range.choice === "global" ? globalRange : range;
  if (selected.choice === "custom") {
    return { startDate: selected.startDate, endDate: selected.endDate };
  }
  const period = selected.choice === "global" ? "7d" : selected.choice;
  const dates = presetDates(period);
  return { period, ...dates };
}

function rangeLabel(range: ReportRange): string {
  if (!range.startDate || !range.endDate) return "Selected period";
  const format = (date: string) =>
    new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(
      new Date(`${date}T12:00:00`),
    );
  return `${format(range.startDate)} – ${format(range.endDate)}`;
}

function daysInRange(range: ReportRange): number {
  if (!range.startDate || !range.endDate) return 1;
  const start = new Date(`${range.startDate}T12:00:00`);
  const end = new Date(`${range.endDate}T12:00:00`);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

function nutrientLabel(name: string): { label: string; unit: string } {
  const units = ["mcg", "mg", "g"];
  const unit = units.find((candidate) => name.endsWith(`_${candidate}`)) ?? "unit";
  const withoutUnit = unit === "unit" ? name : name.slice(0, -(unit.length + 1));
  return {
    label: withoutUnit.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
    unit,
  };
}

function updateChoice(range: LocalRange, choice: RangeChoice): LocalRange {
  if (choice === "custom" || choice === "global") return { ...range, choice };
  return { choice, ...presetDates(choice) };
}

function RangeControl({
  value,
  onChange,
  allowGlobal = true,
}: {
  value: LocalRange;
  onChange: (value: LocalRange) => void;
  allowGlobal?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Chart date range"
        value={value.choice}
        onChange={(event) => onChange(updateChoice(value, event.target.value as RangeChoice))}
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-emerald-500"
      >
        {allowGlobal && <option value="global">Use global range</option>}
        {presets.map((preset) => (
          <option key={preset.value} value={preset.value}>{preset.label}</option>
        ))}
        <option value="custom">Custom dates</option>
      </select>
      {value.choice === "custom" && (
        <>
          <input
            aria-label="Start date"
            type="date"
            value={value.startDate}
            max={value.endDate}
            onChange={(event) => onChange({ ...value, startDate: event.target.value })}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-emerald-500"
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            aria-label="End date"
            type="date"
            value={value.endDate}
            min={value.startDate}
            max={localDate()}
            onChange={(event) => onChange({ ...value, endDate: event.target.value })}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-emerald-500"
          />
        </>
      )}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  range,
  setRange,
  view,
  setView,
  children,
}: {
  title: string;
  subtitle: string;
  range: LocalRange;
  setRange: (range: LocalRange) => void;
  view?: ReportView;
  setView?: (view: ReportView) => void;
  children: React.ReactNode;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
      <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-900">{title}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
          </div>
          {view && setView && (
            <div className="flex rounded-lg bg-slate-100 p-1">
              {(["daily", "weekly"] as const).map((option) => (
                <button
                  type="button"
                  key={option}
                  onClick={() => setView(option)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold capitalize ${
                    view === option ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mt-3">
          <RangeControl value={range} onChange={setRange} />
        </div>
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </article>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="grid h-72 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 text-center">
      <div>
        <p className="font-semibold text-slate-600">No data in this range</p>
        <p className="mt-1 text-sm text-slate-400">{text}</p>
      </div>
    </div>
  );
}

function LoadingChart() {
  return (
    <div className="h-72 animate-pulse rounded-xl bg-slate-100">
      <div className="flex h-full items-end gap-3 p-8">
        {[45, 70, 52, 85, 63, 76, 58].map((height, index) => (
          <span key={`${height}-${index}`} className="flex-1 rounded-t bg-slate-200" style={{ height: `${height}%` }} />
        ))}
      </div>
    </div>
  );
}

function goalRing(name: string, metric: GoalMetric | null, unit: string, fill: string): GoalRingDatum | null {
  if (!metric) return null;
  return {
    name,
    actual: metric.actual,
    target: metric.target,
    unit,
    rawPercentage: metric.percentage,
    percentage: Math.min(metric.percentage, 100),
    fill,
    overTarget: metric.percentage > 100,
  };
}

function SegmentedGoalRing({ data }: { data: GoalRingDatum[] }) {
  const [hoveredName, setHoveredName] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const ringContainerRef = useRef<HTMLDivElement>(null);
  const activeGoal = data.find((goal) => goal.name === hoveredName) ?? data[0];
  const gap = 2.5;
  const availableLength = 100 - gap * data.length;
  const totalTarget = data.reduce((sum, goal) => sum + goal.target, 0);

  useEffect(() => {
    function dismissTouchTooltip(event: PointerEvent) {
      if (!ringContainerRef.current?.contains(event.target as Node)) {
        setHoveredName(null);
        setTooltipPosition(null);
      }
    }
    document.addEventListener("pointerdown", dismissTouchTooltip);
    return () => document.removeEventListener("pointerdown", dismissTouchTooltip);
  }, []);
  let nextStart = 0;
  const segments = data.map((goal) => {
    const segmentLength = totalTarget > 0
      ? goal.target / totalTarget * availableLength
      : availableLength / data.length;
    const segment = { goal, start: nextStart, segmentLength };
    nextStart += segmentLength + gap;
    return segment;
  });

  function showTooltip(event: React.PointerEvent<SVGGElement>, goalName: string) {
    const bounds = ringContainerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const tooltipWidth = 190;
    const tooltipHeight = 112;
    setHoveredName(goalName);
    setTooltipPosition({
      x: Math.max(8, Math.min(event.clientX - bounds.left + 14, bounds.width - tooltipWidth - 8)),
      y: Math.max(8, Math.min(event.clientY - bounds.top + 14, bounds.height - tooltipHeight - 8)),
    });
  }

  return (
    <div ref={ringContainerRef} className="relative grid items-center gap-3 sm:grid-cols-[minmax(220px,1fr)_minmax(175px,0.8fr)]">
      <div className="relative mx-auto aspect-square w-full max-w-56">
        <svg viewBox="0 0 220 220" className="size-full -rotate-90" role="img" aria-label="Nutrient target progress ring">
          {segments.map(({ goal, start, segmentLength }) => {
            const progressLength = segmentLength * goal.percentage / 100;
            return (
              <g
                key={goal.name}
                onPointerEnter={(event) => showTooltip(event, goal.name)}
                onPointerMove={(event) => showTooltip(event, goal.name)}
                onPointerDown={(event) => showTooltip(event, goal.name)}
                onPointerLeave={(event) => {
                  if (event.pointerType !== "touch") {
                    setHoveredName(null);
                    setTooltipPosition(null);
                  }
                }}
                className="cursor-pointer"
              >
                <circle cx="110" cy="110" r="82" pathLength="100" fill="none" stroke="#edf1f0" strokeWidth={hoveredName === goal.name ? 29 : 25} strokeLinecap="round" strokeDasharray={`${segmentLength} ${100 - segmentLength}`} strokeDashoffset={-start} className={`transition-all duration-200 ${hoveredName && hoveredName !== goal.name ? "opacity-55" : ""}`} />
                {progressLength > 0 && (
                  <circle cx="110" cy="110" r="82" pathLength="100" fill="none" stroke={goal.overTarget ? "#f43f5e" : goal.fill} strokeWidth={hoveredName === goal.name ? 31 : 25} strokeLinecap="round" strokeDasharray={`${progressLength} ${100 - progressLength}`} strokeDashoffset={-start} style={hoveredName === goal.name ? { filter: `drop-shadow(0 0 5px ${goal.overTarget ? "#fb7185" : goal.fill})` } : undefined} className={`transition-all duration-200 ${goal.overTarget ? "goal-ring-over" : ""} ${hoveredName && hoveredName !== goal.name ? "opacity-45" : ""}`} />
                )}
              </g>
            );
          })}
        </svg>
        {activeGoal && (
          <div className="pointer-events-none absolute inset-[25%] grid place-items-center rounded-full bg-white text-center shadow-[inset_0_0_0_1px_rgba(226,232,240,0.7)]">
            <div className="px-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400">{activeGoal.name}</p>
              <p className={`mt-1 text-2xl font-black ${activeGoal.overTarget ? "text-rose-600" : "text-slate-900"}`}>{activeGoal.rawPercentage.toFixed(0)}%</p>
              <p className="mt-1 text-[10px] leading-4 text-slate-500">{activeGoal.actual.toLocaleString(undefined, { maximumFractionDigits: 1 })} / {activeGoal.target.toLocaleString(undefined, { maximumFractionDigits: 1 })} {activeGoal.unit}</p>
            </div>
          </div>
        )}
      </div>
      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
        {data.map((goal) => (
          <button type="button" key={goal.name} onMouseEnter={() => setHoveredName(goal.name)} onFocus={() => setHoveredName(goal.name)} onClick={() => setHoveredName(goal.name)} className={`w-full rounded-lg border px-3 py-2 text-left transition ${activeGoal?.name === goal.name ? "border-slate-300 bg-slate-50 shadow-sm" : "border-transparent hover:bg-slate-50"}`}>
            <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-xs font-bold text-slate-700"><span className={`size-2.5 rounded-full ${goal.overTarget ? "animate-pulse bg-rose-500" : ""}`} style={goal.overTarget ? undefined : { backgroundColor: goal.fill }} />{goal.name}</span><span className={`text-xs font-black ${goal.overTarget ? "text-rose-600" : "text-slate-700"}`}>{goal.rawPercentage.toFixed(0)}%</span></div>
            <p className="mt-1 text-[10px] text-slate-500">{goal.actual.toLocaleString(undefined, { maximumFractionDigits: 1 })} / {goal.target.toLocaleString(undefined, { maximumFractionDigits: 1 })} {goal.unit}</p>
          </button>
        ))}
      </div>
      {tooltipPosition && hoveredName && (() => {
        const goal = data.find((item) => item.name === hoveredName);
        if (!goal) return null;
        const difference = Math.abs(goal.target - goal.actual);
        return (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-40 w-[190px] rounded-xl border border-slate-200 bg-white p-3 shadow-[0_14px_38px_rgba(15,23,42,0.2)]"
            style={{ left: tooltipPosition.x, top: tooltipPosition.y }}
          >
            <div className="flex items-center justify-between gap-2"><p className="text-sm font-black text-slate-900">{goal.name}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${goal.overTarget ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-700"}`}>{goal.rawPercentage.toFixed(0)}%</span></div>
            <p className="mt-2 text-xs font-semibold text-slate-700">{goal.actual.toLocaleString(undefined, { maximumFractionDigits: 1 })} / {goal.target.toLocaleString(undefined, { maximumFractionDigits: 1 })} {goal.unit}</p>
            <p className={`mt-1 text-[11px] font-bold ${goal.overTarget ? "text-rose-600" : "text-slate-500"}`}>{difference.toLocaleString(undefined, { maximumFractionDigits: 1 })} {goal.unit} {goal.overTarget ? "over target" : "remaining"}</p>
          </div>
        );
      })()}
    </div>
  );
}

export function DashboardPage() {
  const [globalRange, setGlobalRange] = useState<LocalRange>({ choice: "7d", ...presetDates("7d") });
  const [calorieRange, setCalorieRange] = useState(initialRange());
  const [macroRange, setMacroRange] = useState(initialRange());
  const [microRange, setMicroRange] = useState(initialRange());
  const [goalRange, setGoalRange] = useState(initialRange());
  const [ringRange, setRingRange] = useState(initialRange());
  const [ringView, setRingView] = useState<ReportView>("daily");
  const [ringMetrics, setRingMetrics] = useState(["Calories", "Protein", "Carbs", "Fat"]);
  const [nutrientMenuOpen, setNutrientMenuOpen] = useState(false);
  const nutrientMenuRef = useRef<HTMLDivElement>(null);
  const [calorieView, setCalorieView] = useState<ReportView>("daily");
  const [macroView, setMacroView] = useState<ReportView>("daily");

  useEffect(() => {
    function closeNutrientMenu(event: PointerEvent) {
      if (!nutrientMenuRef.current?.contains(event.target as Node)) {
        setNutrientMenuOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setNutrientMenuOpen(false);
    }

    document.addEventListener("pointerdown", closeNutrientMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeNutrientMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const effectiveCalorieRange = resolvedRange(calorieRange, globalRange);
  const effectiveMacroRange = resolvedRange(macroRange, globalRange);
  const effectiveMicroRange = resolvedRange(microRange, globalRange);
  const effectiveGoalRange = resolvedRange(goalRange, globalRange);
  const effectiveRingRange = resolvedRange(ringRange, globalRange);
  const effectiveGlobalRange = resolvedRange(globalRange, globalRange);

  const globalCalorieQuery = useQuery({
    queryKey: ["reports", "calories", effectiveGlobalRange, "daily"],
    queryFn: () => fetchCalorieTrend(effectiveGlobalRange, "daily"),
  });
  const globalMacroQuery = useQuery({
    queryKey: ["reports", "macros", effectiveGlobalRange, "daily"],
    queryFn: () => fetchMacroTrend(effectiveGlobalRange, "daily"),
  });
  const globalMicroQuery = useQuery({
    queryKey: ["reports", "micros", effectiveGlobalRange],
    queryFn: () => fetchMicronutrients(effectiveGlobalRange),
  });
  const ringGoalQuery = useQuery({
    queryKey: ["reports", "goals", effectiveRingRange],
    queryFn: () => fetchGoalComparison(effectiveRingRange),
  });

  const calorieQuery = useQuery({
    queryKey: ["reports", "calories", effectiveCalorieRange, calorieView],
    queryFn: () => fetchCalorieTrend(effectiveCalorieRange, calorieView),
  });
  const macroQuery = useQuery({
    queryKey: ["reports", "macros", effectiveMacroRange, macroView],
    queryFn: () => fetchMacroTrend(effectiveMacroRange, macroView),
  });
  const microQuery = useQuery({
    queryKey: ["reports", "micros", effectiveMicroRange],
    queryFn: () => fetchMicronutrients(effectiveMicroRange),
  });
  const goalQuery = useQuery({
    queryKey: ["reports", "goals", effectiveGoalRange],
    queryFn: () => fetchGoalComparison(effectiveGoalRange),
    enabled: Boolean(effectiveGoalRange.startDate && effectiveGoalRange.endDate),
  });

  const error = globalCalorieQuery.error ?? globalMacroQuery.error ?? globalMicroQuery.error ?? ringGoalQuery.error ?? calorieQuery.error ?? macroQuery.error ?? microQuery.error ?? goalQuery.error;
  const caloriePoints = calorieQuery.data?.points ?? [];
  const macroPoints = macroQuery.data?.points ?? [];
  const micronutrients = (microQuery.data?.nutrients ?? []).filter((nutrient) => nutrient.amount > 0);
  const globalCaloriePoints = globalCalorieQuery.data?.points ?? [];
  const globalMacroPoints = globalMacroQuery.data?.points ?? [];
  const globalMicronutrients = (globalMicroQuery.data?.nutrients ?? []).filter((nutrient) => nutrient.amount > 0);
  const totalCalories = globalCaloriePoints.reduce((sum, point) => sum + point.calories, 0);
  const averageCalories = Math.round(totalCalories / daysInRange(effectiveGlobalRange));
  const macroTotals = globalMacroPoints.reduce(
      (total, point) => ({
        protein: total.protein + point.protein_g,
        carbs: total.carbs + point.carbs_g,
        fat: total.fat + point.fat_g,
      }),
      { protein: 0, carbs: 0, fat: 0 },
  );
  const micronutrientDisplay = micronutrients.map((nutrient) => {
    const details = nutrientLabel(nutrient.name);
    const largestInUnit = Math.max(
      ...micronutrients
        .filter((candidate) => nutrientLabel(candidate.name).unit === details.unit)
        .map((candidate) => candidate.amount),
    );
    return {
      ...nutrient,
      ...details,
      relative: largestInUnit > 0 ? nutrient.amount / largestInUnit * 100 : 0,
    };
  });
  const goalData: GoalRingDatum[] = goalQuery.data?.has_active_goal
    ? [
        goalRing("Calories", goalQuery.data.calories, "kcal", "#10b981"),
        goalRing("Protein", goalQuery.data.protein_g, "g", "#8b5cf6"),
        goalRing("Carbs", goalQuery.data.carbs_g, "g", "#3b82f6"),
        goalRing("Fat", goalQuery.data.fat_g, "g", "#f59e0b"),
      ].filter((goal): goal is GoalRingDatum => goal !== null)
    : [];
  const ringPeriodDays = daysInRange(effectiveRingRange);
  const ringDisplayFactor = ringView === "daily" ? 1 / ringPeriodDays : 7 / ringPeriodDays;
  const globalGoalData: GoalRingDatum[] = ringGoalQuery.data?.has_active_goal
    ? [
        goalRing("Calories", ringGoalQuery.data.calories, `kcal/${ringView === "daily" ? "day" : "week"}`, "#10b981"),
        goalRing("Protein", ringGoalQuery.data.protein_g, `g/${ringView === "daily" ? "day" : "week"}`, "#8b5cf6"),
        goalRing("Carbs", ringGoalQuery.data.carbs_g, `g/${ringView === "daily" ? "day" : "week"}`, "#3b82f6"),
        goalRing("Fat", ringGoalQuery.data.fat_g, `g/${ringView === "daily" ? "day" : "week"}`, "#f59e0b"),
      ]
        .filter((goal): goal is GoalRingDatum => goal !== null)
        .map((goal) => ({ ...goal, actual: goal.actual * ringDisplayFactor, target: goal.target * ringDisplayFactor }))
        .filter((goal) => ringMetrics.includes(goal.name))
    : [];

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">Overview</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">Nutrition dashboard</h1>
          <p className="mt-2 text-sm text-slate-500">A clear view of your intake, nutrients, and daily targets.</p>
        </div>
        <Link to="/food-log" className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-emerald-200 transition hover:bg-emerald-700">+ Log a meal</Link>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-slate-900">Global time filter</p>
            <p className="mt-0.5 text-xs text-slate-500">All charts follow this until you override one.</p>
          </div>
          <RangeControl value={globalRange} onChange={setGlobalRange} allowGlobal={false} />
        </div>
        <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span className="size-2 rounded-full bg-emerald-500" />
          Active range: <strong className="font-semibold text-slate-700">{rangeLabel(resolvedRange(globalRange, globalRange))}</strong>
        </div>
      </div>

      {error && <p className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{getApiErrorMessage(error)}</p>}

      <div className="grid items-start gap-5 xl:grid-cols-5">
        <div className="grid auto-rows-max gap-4 self-start sm:grid-cols-2 xl:col-span-3">
          {[
            { label: "Total calories", value: Math.round(totalCalories).toLocaleString(), unit: "kcal", note: "Consumed in the global range", icon: "Σ", accent: "from-emerald-500 to-teal-500", soft: "bg-emerald-50 text-emerald-700" },
            { label: "Daily average", value: averageCalories.toLocaleString(), unit: "kcal", note: "Average per calendar day in range", icon: "↗", accent: "from-blue-500 to-cyan-500", soft: "bg-blue-50 text-blue-700" },
            { label: "Protein consumed", value: macroTotals.protein.toFixed(1), unit: "g", note: "Total in the global range", icon: "P", accent: "from-violet-500 to-purple-500", soft: "bg-violet-50 text-violet-700" },
            { label: "Tracked nutrients", value: globalMicronutrients.length.toString(), unit: "types", note: "Micronutrients found in meals", icon: "✦", accent: "from-amber-500 to-orange-500", soft: "bg-amber-50 text-amber-700" },
          ].map((metric) => (
            <article key={metric.label} className="group relative min-h-40 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_35px_rgba(15,23,42,0.08)]">
              <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${metric.accent}`} />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.13em] text-slate-500">{metric.label}</p>
                  <p className="mt-3 flex items-baseline gap-2 text-3xl font-black tracking-tight text-slate-950">
                    {metric.value}<span className="text-sm font-bold text-slate-400">{metric.unit}</span>
                  </p>
                </div>
                <span className={`grid size-11 place-items-center rounded-xl text-base font-black ${metric.soft}`}>{metric.icon}</span>
              </div>
              <p className="mt-3 border-t border-slate-100 pt-3 text-xs font-medium text-slate-400">{metric.note}</p>
            </article>
          ))}
        </div>

        <article className="self-start rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)] xl:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="font-bold text-slate-900">Target progress ring</h2><p className="mt-0.5 text-xs text-slate-500">Section size follows its target; color shows completed intake</p></div>
            {globalGoalData.some((goal) => goal.overTarget) && <span className="animate-pulse rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-600">Target exceeded</span>}
          </div>
          <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/60 p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg bg-slate-200/70 p-1">
                {(["daily", "weekly"] as const).map((view) => <button type="button" key={view} onClick={() => setRingView(view)} className={`rounded-md px-3 py-1.5 text-xs font-bold capitalize transition ${ringView === view ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{view}</button>)}
              </div>
              <div ref={nutrientMenuRef} className="relative">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={nutrientMenuOpen}
                  onClick={() => setNutrientMenuOpen((open) => !open)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                >
                  {ringMetrics.length === 4 ? "All nutrients" : `${ringMetrics.length} selected`} <span className={`inline-block transition-transform duration-200 ${nutrientMenuOpen ? "rotate-180" : ""}`}>▾</span>
                </button>
                {nutrientMenuOpen && <div role="menu" className="absolute right-0 z-30 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                  {["Calories", "Protein", "Carbs", "Fat"].map((metric) => (
                    <label key={metric} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      <input type="checkbox" checked={ringMetrics.includes(metric)} onChange={(event) => {
                        if (event.target.checked) setRingMetrics((current) => [...new Set([...current, metric])]);
                        else if (ringMetrics.length > 1) setRingMetrics((current) => current.filter((item) => item !== metric));
                      }} className="accent-emerald-600" />{metric}
                    </label>
                  ))}
                  <p className="border-t border-slate-100 px-2 pt-2 text-[10px] text-slate-400">At least one nutrient stays selected.</p>
                </div>}
              </div>
              <RangeControl value={ringRange} onChange={setRingRange} />
            </div>
          </div>
          {ringGoalQuery.isLoading ? <div className="mt-4 h-64 animate-pulse rounded-xl bg-slate-100" /> : !ringGoalQuery.data?.has_active_goal ? (
            <div className="mt-5 grid h-64 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 text-center"><div><p className="font-semibold text-slate-700">No active goal</p><p className="mt-1 text-xs text-slate-500">Create a goal to see target rings.</p><Link to="/goals" className="mt-3 inline-block text-sm font-bold text-emerald-700">Create goal →</Link></div></div>
          ) : (
            <div className="mt-2"><SegmentedGoalRing data={globalGoalData} /></div>
          )}
        </article>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="Calorie trend" subtitle={rangeLabel(effectiveCalorieRange)} range={calorieRange} setRange={setCalorieRange} view={calorieView} setView={setCalorieView}>
          {calorieQuery.isLoading ? <LoadingChart /> : caloriePoints.length === 0 ? <EmptyChart text="Log a meal or choose another date range." /> : (
            <div className="h-72"><ResponsiveContainer width="100%" height="100%">{caloriePoints.length === 1 ? (
              <BarChart data={caloriePoints} margin={{ top: 26, left: -8, right: 8 }}><CartesianGrid stroke="#eef2f1" vertical={false} /><XAxis dataKey="period" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} /><YAxis domain={[0, (maximum: number) => Math.max(100, Math.ceil(maximum * 1.2))]} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} /><Tooltip formatter={(value) => [`${value} kcal`, "Calories"]} contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0" }} /><Bar dataKey="calories" name="Calories" fill="#10b981" maxBarSize={72} radius={[10, 10, 0, 0]}><LabelList dataKey="calories" position="top" formatter={(value: React.ReactNode) => `${value} kcal`} className="fill-slate-700 text-xs font-bold" /></Bar></BarChart>
            ) : (
              <LineChart data={caloriePoints} margin={{ top: 24, left: -8, right: 14 }}><CartesianGrid stroke="#eef2f1" vertical={false} /><XAxis dataKey="period" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} /><YAxis domain={[0, (maximum: number) => Math.max(100, Math.ceil(maximum * 1.15))]} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} /><Tooltip formatter={(value) => [`${value} kcal`, "Calories"]} contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0" }} /><Line type="monotone" dataKey="calories" name="Calories" stroke="#059669" strokeWidth={3} dot={{ r: 5, fill: "#fff", strokeWidth: 3 }} activeDot={{ r: 7 }} /></LineChart>
            )}</ResponsiveContainer></div>
          )}
        </ChartCard>

        <ChartCard title="Macronutrient breakdown" subtitle={rangeLabel(effectiveMacroRange)} range={macroRange} setRange={setMacroRange} view={macroView} setView={setMacroView}>
          {macroQuery.isLoading ? <LoadingChart /> : macroPoints.length === 0 ? <EmptyChart text="No macronutrients were recorded here." /> : (
            <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={macroPoints} margin={{ top: 16, left: -8, right: 8 }}><CartesianGrid stroke="#eef2f1" vertical={false} /><XAxis dataKey="period" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} unit="g" /><Tooltip formatter={(value, name) => [`${Number(value).toFixed(1)} g`, name]} contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0" }} /><Legend iconType="circle" iconSize={8} /><Bar stackId="macros" dataKey="protein_g" name="Protein" fill="#10b981" /><Bar stackId="macros" dataKey="carbs_g" name="Carbs" fill="#3b82f6" /><Bar stackId="macros" dataKey="fat_g" name="Fat" fill="#f59e0b" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>
          )}
        </ChartCard>

        <ChartCard title="Micronutrient totals" subtitle={`${rangeLabel(effectiveMicroRange)} · discovered dynamically`} range={microRange} setRange={setMicroRange}>
          {microQuery.isLoading ? <LoadingChart /> : micronutrients.length === 0 ? <EmptyChart text="No micronutrient values were recorded here." /> : (
            <div className="space-y-4">
              <div className="max-h-72 space-y-3 overflow-y-auto pr-2">
                {micronutrientDisplay.map((nutrient) => (
                  <div key={nutrient.name} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                    <div className="mb-2 flex items-center justify-between gap-3"><span className="text-xs font-bold text-slate-700">{nutrient.label}</span><span className="rounded-md bg-violet-100 px-2 py-1 text-xs font-black text-violet-700">{nutrient.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} {nutrient.unit}</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-violet-100"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-700" style={{ width: `${nutrient.relative}%` }} /></div>
                  </div>
                ))}
              </div>
              <p className="rounded-lg bg-violet-50 px-3 py-2 text-xs leading-5 text-violet-700">Exact values are shown with their units. Bar length compares nutrients only within the same unit, avoiding misleading gram-versus-milligram scaling.</p>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Goal vs actual" subtitle={rangeLabel(effectiveGoalRange)} range={goalRange} setRange={setGoalRange}>
          {goalQuery.isLoading ? <LoadingChart /> : !goalQuery.data?.has_active_goal ? <EmptyChart text="Create an active goal to compare your intake." /> : goalData.length === 0 ? <EmptyChart text="No goal comparison is available." /> : (
            <div className="space-y-5 py-2">
              {goalData.map((goal) => (
                <div key={goal.name}>
                  <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                    <div><p className="text-sm font-bold text-slate-800">{goal.name}</p><p className="mt-0.5 text-xs text-slate-500">{goal.actual.toLocaleString()} of {goal.target.toLocaleString()} {goal.unit}</p></div>
                    <div className="text-right"><p className={`text-lg font-black ${goal.overTarget ? "text-rose-600" : "text-slate-800"}`}>{goal.rawPercentage.toFixed(0)}%</p>{goal.overTarget && <p className="text-[10px] font-bold uppercase tracking-wider text-rose-500">Over by {(goal.actual - goal.target).toLocaleString()} {goal.unit}</p>}</div>
                  </div>
                  <div className="relative h-3 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full transition-all duration-700 ${goal.overTarget ? "goal-progress-over bg-rose-500" : ""}`} style={{ width: `${goal.percentage}%`, backgroundColor: goal.overTarget ? undefined : goal.fill }} />
                  </div>
                </div>
              ))}
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">Progress is normalized to 100%, so calories and grams remain easy to compare. Exact actual and target values are shown above each bar.</p>
            </div>
          )}
        </ChartCard>
      </div>
    </section>
  );
}
