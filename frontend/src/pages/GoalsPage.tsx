import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  activateGoal,
  createGoal,
  deleteGoal,
  fetchGoals,
  updateGoal,
} from "../features/goals/goalsApi";
import { useChatImport } from "../features/chat/chatImportContext";
import type { Goal, GoalInput } from "../types/goal";
import { getApiErrorMessage } from "../utils/apiError";

const goalSchema = z
  .object({
    goal_type: z.enum(["lose", "gain", "maintain"]),
    daily_calorie_target: z.number().int().positive("Calories must be greater than zero").max(20000),
    daily_protein_target_g: z.number().nonnegative().max(2000),
    daily_carbs_target_g: z.number().nonnegative().max(5000),
    daily_fat_target_g: z.number().nonnegative().max(2000),
    target_weight_kg: z.number().positive().max(1000).optional(),
    start_date: z.string().min(1, "Start date is required"),
    end_date: z.string().optional(),
  })
  .refine((goal) => !goal.end_date || goal.end_date >= goal.start_date, {
    message: "End date must be on or after the start date",
    path: ["end_date"],
  });

type GoalForm = z.infer<typeof goalSchema>;

const inputClass =
  "mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";

function today(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function goalDefaults(): GoalForm {
  return {
    goal_type: "maintain",
    daily_calorie_target: 2000,
    daily_protein_target_g: 120,
    daily_carbs_target_g: 220,
    daily_fat_target_g: 65,
    target_weight_kg: undefined,
    start_date: today(),
    end_date: "",
  };
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(`${value}T12:00:00`));
}

export function GoalsPage() {
  const queryClient = useQueryClient();
  const {
    pendingImport,
    registerSaveHandler,
    completePending,
  } = useChatImport();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [notice, setNotice] = useState("");

  const goalsQuery = useQuery({
    queryKey: ["goals", page, pageSize],
    queryFn: () => fetchGoals(page, pageSize),
    placeholderData: (previous) => previous,
  });

  const { register, handleSubmit, reset, getValues, trigger, formState: { errors } } = useForm<GoalForm>({
    resolver: zodResolver(goalSchema),
    defaultValues: goalDefaults(),
  });

  async function refreshGoals() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["goals"] }),
      queryClient.invalidateQueries({ queryKey: ["reports"] }),
    ]);
  }

  function clearForm() {
    setEditingGoal(null);
    reset(goalDefaults());
  }

  const createMutation = useMutation({
    mutationFn: createGoal,
    onSuccess: async () => {
      clearForm();
      setPage(1);
      setNotice("Goal created and activated.");
      await refreshGoals();
      if (pendingImport?.kind === "goal") {
        completePending("Done! I saved and activated your new health goal.");
      }
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: GoalInput }) => updateGoal(id, input),
    onSuccess: async () => {
      clearForm();
      setNotice("Goal updated successfully.");
      await refreshGoals();
    },
  });
  const activateMutation = useMutation({
    mutationFn: activateGoal,
    onSuccess: async () => {
      setNotice("Active goal changed.");
      await refreshGoals();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteGoal,
    onSuccess: async () => {
      if ((goalsQuery.data?.items.length ?? 0) === 1 && page > 1) setPage((current) => current - 1);
      setNotice("Goal deleted.");
      await refreshGoals();
    },
  });

  function submit(form: GoalForm) {
    const input: GoalInput = {
      ...form,
      target_weight_kg: form.target_weight_kg ?? null,
      end_date: form.end_date || null,
      is_active: editingGoal?.is_active ?? true,
    };
    if (editingGoal) updateMutation.mutate({ id: editingGoal.id, input });
    else createMutation.mutate(input);
  }

  useEffect(() => {
    if (pendingImport?.kind !== "goal") return;
    const defaults = goalDefaults();
    const values = pendingImport.values;
    setEditingGoal(null);
    setNotice("Review the goal suggested by NutriX AI, then confirm here or in chat.");
    reset({
      goal_type: values.goal_type ?? defaults.goal_type,
      daily_calorie_target: values.daily_calorie_target ?? defaults.daily_calorie_target,
      daily_protein_target_g: values.daily_protein_target_g ?? defaults.daily_protein_target_g,
      daily_carbs_target_g: values.daily_carbs_target_g ?? defaults.daily_carbs_target_g,
      daily_fat_target_g: values.daily_fat_target_g ?? defaults.daily_fat_target_g,
      target_weight_kg: values.target_weight_kg ?? undefined,
      start_date: values.start_date ?? defaults.start_date,
      end_date: values.end_date ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [pendingImport, reset]);

  useEffect(() => {
    if (pendingImport?.kind !== "goal") {
      registerSaveHandler(null);
      return;
    }

    registerSaveHandler(async () => {
      const valid = await trigger();
      if (!valid) {
        throw new Error("Please correct the highlighted goal fields before saving.");
      }
      const form = getValues();
      await createMutation.mutateAsync({
        ...form,
        target_weight_kg: form.target_weight_kg ?? null,
        end_date: form.end_date || null,
        is_active: true,
      });
    });
    return () => registerSaveHandler(null);
  }, [pendingImport, registerSaveHandler, trigger, getValues, createMutation]);

  function edit(goal: Goal) {
    setNotice("");
    setEditingGoal(goal);
    reset({
      goal_type: goal.goal_type,
      daily_calorie_target: goal.daily_calorie_target,
      daily_protein_target_g: goal.daily_protein_target_g,
      daily_carbs_target_g: goal.daily_carbs_target_g,
      daily_fat_target_g: goal.daily_fat_target_g,
      target_weight_kg: goal.target_weight_kg ?? undefined,
      start_date: goal.start_date,
      end_date: goal.end_date ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const saveMutation = editingGoal ? updateMutation : createMutation;
  const actionError = saveMutation.error ?? activateMutation.error ?? deleteMutation.error;

  return (
    <section className="space-y-7">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">Personal targets</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">Health goals</h1>
        <p className="mt-2 text-sm text-slate-500">Create, edit, and activate the targets used throughout your dashboard.</p>
      </header>

      {notice && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          <span>✓ {notice}</span><button type="button" onClick={() => setNotice("")} className="text-lg">×</button>
        </div>
      )}

      <form onSubmit={handleSubmit(submit)} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-4 sm:px-7">
          <div><h2 className="font-bold text-slate-900">{editingGoal ? "Edit goal" : "Create a new goal"}</h2><p className="mt-0.5 text-xs text-slate-500">Targets are measured per day.</p></div>
          {editingGoal && <button type="button" onClick={clearForm} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600">Cancel editing</button>}
        </div>
        <div className="p-5 sm:p-7">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm font-semibold text-slate-700">Goal type<select {...register("goal_type")} className={inputClass}><option value="lose">Lose weight</option><option value="gain">Gain weight</option><option value="maintain">Maintain weight</option></select></label>
            {([
              ["daily_calorie_target", "Daily calories", "kcal"],
              ["daily_protein_target_g", "Protein target", "g"],
              ["daily_carbs_target_g", "Carb target", "g"],
              ["daily_fat_target_g", "Fat target", "g"],
            ] as const).map(([name, label, unit]) => (
              <label key={name} className="text-sm font-semibold text-slate-700">{label} ({unit})<input type="number" min="0" step={name === "daily_calorie_target" ? "1" : "0.01"} {...register(name, { valueAsNumber: true })} className={inputClass} />{errors[name] && <span className="mt-1 block text-xs font-normal text-red-600">{errors[name]?.message}</span>}</label>
            ))}
            <label className="text-sm font-semibold text-slate-700">Target weight (kg)<input type="number" min="0.1" step="0.1" {...register("target_weight_kg", { setValueAs: (value) => value === "" ? undefined : Number(value) })} className={inputClass} />{errors.target_weight_kg && <span className="mt-1 block text-xs font-normal text-red-600">{errors.target_weight_kg.message}</span>}</label>
            <label className="text-sm font-semibold text-slate-700">Start date<input type="date" {...register("start_date")} className={inputClass} />{errors.start_date && <span className="mt-1 block text-xs font-normal text-red-600">{errors.start_date.message}</span>}</label>
            <label className="text-sm font-semibold text-slate-700">End date (optional)<input type="date" {...register("end_date")} className={inputClass} />{errors.end_date && <span className="mt-1 block text-xs font-normal text-red-600">{errors.end_date.message}</span>}</label>
          </div>
          {actionError && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{getApiErrorMessage(actionError)}</p>}
          <div className="mt-6 flex gap-3"><button disabled={saveMutation.isPending} className="rounded-lg bg-emerald-600 px-5 py-2.5 font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{saveMutation.isPending ? "Saving…" : editingGoal ? "Update goal" : "Create goal"}</button><button type="button" onClick={clearForm} className="rounded-lg border border-slate-200 px-5 py-2.5 font-semibold text-slate-600">Reset</button></div>
        </div>
      </form>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-slate-900">Your goals</h2><p className="mt-1 text-sm text-slate-500">{goalsQuery.data?.pagination.total ?? 0} saved goals</p></div><label className="flex items-center gap-2 text-xs font-semibold text-slate-500">Rows<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="rounded-lg border border-slate-200 px-2 py-1.5"><option value={5}>5</option><option value={10}>10</option><option value={20}>20</option></select></label></div>
        {goalsQuery.isLoading && <p className="mt-6 animate-pulse text-slate-500">Loading goals…</p>}
        {goalsQuery.isError && <p className="mt-6 rounded-lg bg-red-50 p-3 text-red-700">{getApiErrorMessage(goalsQuery.error)}</p>}
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {goalsQuery.data?.items.map((goal) => (
            <article key={goal.id} className={`rounded-xl border p-5 ${goal.is_active ? "border-emerald-300 bg-emerald-50/60" : "border-slate-200"}`}>
              <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="font-bold capitalize text-slate-900">{goal.goal_type} weight</h3>{goal.is_active && <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">Active</span>}</div><p className="mt-1 text-xs text-slate-500">{formatDate(goal.start_date)} – {goal.end_date ? formatDate(goal.end_date) : "No end date"}</p></div>{goal.target_weight_kg && <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-sm">{goal.target_weight_kg} kg</span>}</div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{[["Calories", goal.daily_calorie_target, "kcal"], ["Protein", goal.daily_protein_target_g, "g"], ["Carbs", goal.daily_carbs_target_g, "g"], ["Fat", goal.daily_fat_target_g, "g"]].map(([label, value, unit]) => <div key={label} className="rounded-lg bg-white/80 p-2.5"><p className="text-[10px] font-bold uppercase text-slate-400">{label}</p><p className="mt-1 text-sm font-bold text-slate-800">{value} {unit}</p></div>)}</div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200/70 pt-4"><button type="button" onClick={() => edit(goal)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">Edit</button>{!goal.is_active && <button type="button" disabled={activateMutation.isPending} onClick={() => activateMutation.mutate(goal.id)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Activate</button>}<button type="button" disabled={deleteMutation.isPending && deleteMutation.variables === goal.id} onClick={() => { if (window.confirm("Delete this goal?")) deleteMutation.mutate(goal.id); }} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-600 disabled:opacity-50">{deleteMutation.isPending && deleteMutation.variables === goal.id ? "Deleting…" : "Delete"}</button></div>
            </article>
          ))}
        </div>
        {!goalsQuery.isLoading && goalsQuery.data?.items.length === 0 && <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-10 text-center"><p className="font-semibold text-slate-700">No goals yet</p><p className="mt-1 text-sm text-slate-500">Create your first goal above.</p></div>}
        {(goalsQuery.data?.pagination.total ?? 0) > 0 && <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-5"><button type="button" disabled={!goalsQuery.data?.pagination.has_previous} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold disabled:opacity-40">Previous</button><span className="text-sm text-slate-500">Page {page} of {goalsQuery.data?.pagination.total_pages || 1}</span><button type="button" disabled={!goalsQuery.data?.pagination.has_next} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold disabled:opacity-40">Next</button></div>}
      </section>
    </section>
  );
}
