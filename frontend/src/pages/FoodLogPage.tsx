import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { NutritionImageUpload } from "../components/forms/NutritionImageUpload";
import { useChatImport } from "../features/chat/chatImportContext";
import {
  createEntry,
  deleteEntry,
  fetchEntries,
  updateEntry,
} from "../features/entries/entriesApi";
import type { EntryInput, FoodEntry, MealType } from "../types/entry";
import type { NutritionExtraction } from "../types/nutritionExtraction";
import { getApiErrorMessage } from "../utils/apiError";

const mealTypes = ["breakfast", "lunch", "dinner", "snacks"] as const;

const entrySchema = z.object({
  meal_type: z.enum(mealTypes),
  food_name: z.string().trim().min(1, "Food name is required").max(200),
  quantity_value: z.number().positive("Quantity must be greater than zero"),
  quantity_unit: z.string().trim().min(1, "Unit is required").max(30),
  calories: z.number().int().nonnegative(),
  protein_g: z.number().nonnegative(),
  carbs_g: z.number().nonnegative(),
  fat_g: z.number().nonnegative(),
  fiber_g: z.number().nonnegative(),
  sugar_g: z.number().nonnegative(),
  sodium_mg: z.number().nonnegative(),
  potassium_mg: z.number().nonnegative(),
  calcium_mg: z.number().nonnegative(),
  iron_mg: z.number().nonnegative(),
  vitamin_c_mg: z.number().nonnegative(),
  consumed_at: z.string().min(1, "Date and time are required"),
});

type EntryForm = z.infer<typeof entrySchema>;

const inputClass =
  "mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";

const numberFields = [
  ["calories", "Calories", "kcal"],
  ["protein_g", "Protein", "g"],
  ["carbs_g", "Carbohydrates", "g"],
  ["fat_g", "Fat", "g"],
] as const;

const micronutrientFields = [
  ["fiber_g", "Fiber", "g"],
  ["sugar_g", "Sugar", "g"],
  ["sodium_mg", "Sodium", "mg"],
  ["potassium_mg", "Potassium", "mg"],
  ["calcium_mg", "Calcium", "mg"],
  ["iron_mg", "Iron", "mg"],
  ["vitamin_c_mg", "Vitamin C", "mg"],
] as const;

function localDateTime(value = new Date()): string {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function defaultValues(): EntryForm {
  return {
    meal_type: "breakfast",
    food_name: "",
    quantity_value: 1,
    quantity_unit: "serving",
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
    sugar_g: 0,
    sodium_mg: 0,
    potassium_mg: 0,
    calcium_mg: 0,
    iron_mg: 0,
    vitamin_c_mg: 0,
    consumed_at: localDateTime(),
  };
}

function startOfDay(date: string): string | undefined {
  return date ? new Date(`${date}T00:00:00`).toISOString() : undefined;
}

function endOfDay(date: string): string | undefined {
  return date ? new Date(`${date}T23:59:59.999`).toISOString() : undefined;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function FoodLogPage() {
  const queryClient = useQueryClient();
  const {
    pendingImport,
    registerSaveHandler,
    completePending,
  } = useChatImport();
  const appliedChatImport = useRef<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [mealType, setMealType] = useState<MealType | "">("");
  const [searchText, setSearchText] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [editingEntry, setEditingEntry] = useState<FoodEntry | null>(null);
  const [uploadVersion, setUploadVersion] = useState(0);
  const [saveNotice, setSaveNotice] = useState("");
  const [newNutrientName, setNewNutrientName] = useState("");
  const [newNutrientAmount, setNewNutrientAmount] = useState("");
  const [nutrientError, setNutrientError] = useState("");
  const [aiMicronutrients, setAiMicronutrients] = useState<
    Record<string, number>
  >({});
  const deferredSearch = useDeferredValue(searchText.trim());

  const invalidDateRange = Boolean(
    startDate && endDate && startDate > endDate,
  );

  const entriesQuery = useQuery({
    queryKey: [
      "entries",
      page,
      pageSize,
      mealType,
      deferredSearch,
      startDate,
      endDate,
    ],
    queryFn: () =>
      fetchEntries({
        page,
        limit: pageSize,
        mealType: mealType || undefined,
        search: deferredSearch || undefined,
        startDate: startOfDay(startDate),
        endDate: endOfDay(endDate),
      }),
    enabled: !invalidDateRange,
    placeholderData: (previous) => previous,
  });

  const {
    register,
    handleSubmit,
    getValues,
    reset,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<EntryForm>({
    resolver: zodResolver(entrySchema),
    defaultValues: defaultValues(),
  });

  async function refreshNutritionData() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["entries"] }),
      queryClient.invalidateQueries({ queryKey: ["reports"] }),
    ]);
  }

  function clearForm() {
    setEditingEntry(null);
    setAiMicronutrients({});
    setNewNutrientName("");
    setNewNutrientAmount("");
    setNutrientError("");
    setUploadVersion((version) => version + 1);
    reset(defaultValues());
  }

  const createMutation = useMutation({
    mutationFn: createEntry,
    onSuccess: async (createdEntry) => {
      if (pendingImport?.kind === "image") {
        completePending(
          `Saved successfully. I added ${createdEntry.food_name} to your food log.`,
        );
      }
      clearForm();
      setSaveNotice("Meal saved successfully.");
      setPage(1);
      await refreshNutritionData();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: EntryInput }) =>
      updateEntry(id, input),
    onSuccess: async () => {
      clearForm();
      setSaveNotice("Meal updated successfully.");
      await refreshNutritionData();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteEntry,
    onSuccess: async () => {
      if ((entriesQuery.data?.items.length ?? 0) === 1 && page > 1) {
        setPage((current) => current - 1);
      }
      setSaveNotice("Meal deleted successfully.");
      await refreshNutritionData();
    },
  });

  const applyExtraction = useCallback((nutrition: NutritionExtraction) => {
    setValue("food_name", nutrition.food_name, { shouldValidate: true });
    setValue("quantity_value", nutrition.quantity_value);
    setValue("quantity_unit", nutrition.quantity_unit);
    setValue("calories", nutrition.calories);
    setValue("protein_g", nutrition.protein_g);
    setValue("carbs_g", nutrition.carbs_g);
    setValue("fat_g", nutrition.fat_g);

    for (const [name] of micronutrientFields) {
      setValue(name, nutrition.micronutrients[name] ?? 0);
    }

    setAiMicronutrients(nutrition.micronutrients);
  }, [setValue]);

  function beginEditing(entry: FoodEntry) {
    setSaveNotice("");
    setEditingEntry(entry);
    setAiMicronutrients(entry.micronutrients);
    reset({
      meal_type: entry.meal_type,
      food_name: entry.food_name,
      quantity_value: entry.quantity_value,
      quantity_unit: entry.quantity_unit,
      calories: entry.calories,
      protein_g: entry.protein_g,
      carbs_g: entry.carbs_g,
      fat_g: entry.fat_g,
      fiber_g: entry.micronutrients.fiber_g ?? 0,
      sugar_g: entry.micronutrients.sugar_g ?? 0,
      sodium_mg: entry.micronutrients.sodium_mg ?? 0,
      potassium_mg: entry.micronutrients.potassium_mg ?? 0,
      calcium_mg: entry.micronutrients.calcium_mg ?? 0,
      iron_mg: entry.micronutrients.iron_mg ?? 0,
      vitamin_c_mg: entry.micronutrients.vitamin_c_mg ?? 0,
      consumed_at: localDateTime(new Date(entry.consumed_at)),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function addMicronutrient() {
    const name = newNutrientName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    const amount = Number(newNutrientAmount);
    if (!name) {
      setNutrientError("Enter a nutrient name, including its unit.");
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      setNutrientError("Enter a valid non-negative amount.");
      return;
    }
    if (micronutrientFields.some(([fixedName]) => fixedName === name)) {
      setNutrientError("That nutrient already has a field above.");
      return;
    }
    setAiMicronutrients((current) => ({ ...current, [name]: amount }));
    setNewNutrientName("");
    setNewNutrientAmount("");
    setNutrientError("");
  }

  function submit(form: EntryForm) {
    const input = buildEntryInput(form);

    if (editingEntry) {
      updateMutation.mutate({ id: editingEntry.id, input });
    } else {
      createMutation.mutate(input);
    }
  }

  const buildEntryInput = useCallback((form: EntryForm): EntryInput => {
    return {
      meal_type: form.meal_type,
      food_name: form.food_name,
      quantity_value: form.quantity_value,
      quantity_unit: form.quantity_unit,
      calories: form.calories,
      protein_g: form.protein_g,
      carbs_g: form.carbs_g,
      fat_g: form.fat_g,
      micronutrients: {
        ...aiMicronutrients,
        fiber_g: form.fiber_g,
        sugar_g: form.sugar_g,
        sodium_mg: form.sodium_mg,
        potassium_mg: form.potassium_mg,
        calcium_mg: form.calcium_mg,
        iron_mg: form.iron_mg,
        vitamin_c_mg: form.vitamin_c_mg,
      },
      consumed_at: new Date(form.consumed_at).toISOString(),
    };
  }, [aiMicronutrients]);

  useEffect(() => {
    if (
      pendingImport?.kind !== "image" ||
      appliedChatImport.current === pendingImport.id
    ) {
      return;
    }

    appliedChatImport.current = pendingImport.id;
    setEditingEntry(null);
    applyExtraction(pendingImport.extraction);
    setSaveNotice(
      `NutriX analyzed ${pendingImport.fileName}. Review the prefilled details before saving.`,
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [pendingImport, applyExtraction]);

  useEffect(() => {
    if (pendingImport?.kind !== "image") {
      registerSaveHandler(null);
      return;
    }

    registerSaveHandler(async () => {
      const valid = await trigger();
      if (!valid) {
        throw new Error("Correct the highlighted meal details before saving.");
      }
      await createMutation.mutateAsync(buildEntryInput(getValues()));
    });

    return () => registerSaveHandler(null);
  }, [
    pendingImport,
    registerSaveHandler,
    trigger,
    getValues,
    createMutation,
    buildEntryInput,
  ]);

  const saveMutation = editingEntry ? updateMutation : createMutation;
  const filteredTotals = entriesQuery.data?.totals ?? {
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
  };

  return (
    <section className="space-y-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wider text-emerald-700">
          Nutrition journal
        </p>
        <h1 className="mt-1 text-3xl font-bold text-slate-950">Food log</h1>
        <p className="mt-2 text-slate-600">
          Add meals manually or prefill nutrition from a food photo or label.
        </p>
      </header>

      {saveNotice && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          <span>✓ {saveNotice}</span>
          <button type="button" onClick={() => setSaveNotice("")} className="text-lg leading-none">×</button>
        </div>
      )}

      <form
        onSubmit={handleSubmit(submit)}
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)] sm:p-7"
      >
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">
              {editingEntry ? "Edit meal" : "Add a meal"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              All nutrition values apply to the quantity entered.
            </p>
          </div>

          {editingEntry && (
            <button
              type="button"
              onClick={clearForm}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel editing
            </button>
          )}
        </div>

        <NutritionImageUpload key={uploadVersion} onExtracted={applyExtraction} />

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-medium text-slate-700">
            Meal type
            <select {...register("meal_type")} className={inputClass}>
              {mealTypes.map((type) => (
                <option key={type} value={type}>
                  {titleCase(type)}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700 md:col-span-2">
            Food name
            <input
              {...register("food_name")}
              placeholder="For example, oatmeal with banana"
              className={inputClass}
            />
            {errors.food_name && (
              <span className="mt-1 block text-xs text-red-600">
                {errors.food_name.message}
              </span>
            )}
          </label>

          <label className="text-sm font-medium text-slate-700">
            Consumed at
            <input
              type="datetime-local"
              {...register("consumed_at")}
              className={inputClass}
            />
            {errors.consumed_at && (
              <span className="mt-1 block text-xs text-red-600">{errors.consumed_at.message}</span>
            )}
          </label>

          <label className="text-sm font-medium text-slate-700">
            Quantity
            <input
              type="number"
              min="0.01"
              step="0.01"
              {...register("quantity_value", { valueAsNumber: true })}
              className={inputClass}
            />
            {errors.quantity_value && (
              <span className="mt-1 block text-xs text-red-600">{errors.quantity_value.message}</span>
            )}
          </label>

          <label className="text-sm font-medium text-slate-700">
            Unit
            <input
              {...register("quantity_unit")}
              placeholder="g, ml, serving, cup"
              className={inputClass}
            />
            {errors.quantity_unit && (
              <span className="mt-1 block text-xs text-red-600">{errors.quantity_unit.message}</span>
            )}
          </label>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {numberFields.map(([name, label, unit]) => (
            <label key={name} className="text-sm font-medium text-slate-700">
              {label} ({unit})
              <input
                type="number"
                min="0"
                step={name === "calories" ? "1" : "0.01"}
                {...register(name, { valueAsNumber: true })}
                className={inputClass}
              />
              {errors[name] && (
                <span className="mt-1 block text-xs text-red-600">{errors[name]?.message}</span>
              )}
            </label>
          ))}
        </div>

        <details className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <summary className="cursor-pointer font-semibold text-slate-800">
            Micronutrients
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {micronutrientFields.map(([name, label, unit]) => (
              <label key={name} className="text-sm font-medium text-slate-700">
                {label} ({unit})
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  {...register(name, { valueAsNumber: true })}
                  className={inputClass}
                />
                {errors[name] && (
                  <span className="mt-1 block text-xs text-red-600">{errors[name]?.message}</span>
                )}
              </label>
            ))}
          </div>
          {Object.entries(aiMicronutrients).filter(
            ([name]) =>
              !micronutrientFields.some(([fixedName]) => fixedName === name),
          ).length > 0 && (
            <div className="mt-5 border-t border-slate-200 pt-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Additional nutrients detected by AI
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(aiMicronutrients)
                  .filter(
                    ([name]) =>
                      !micronutrientFields.some(
                        ([fixedName]) => fixedName === name,
                      ),
                  )
                  .map(([name, amount]) => (
                    <div
                      key={name}
                      className="flex items-center gap-2 rounded-xl border border-violet-200 bg-white p-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold capitalize text-violet-700">
                        {name.replaceAll("_", " ")}
                      </span>
                      <input
                        aria-label={`Amount for ${name}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={amount}
                        onChange={(event) =>
                          setAiMicronutrients((current) => ({
                            ...current,
                            [name]: Number(event.target.value),
                          }))
                        }
                        className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-violet-400"
                      />
                      <button
                        type="button"
                        aria-label={`Remove ${name}`}
                        onClick={() =>
                          setAiMicronutrients((current) => {
                            const updated = { ...current };
                            delete updated[name];
                            return updated;
                          })
                        }
                        className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        ×
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}
          <div className="mt-5 border-t border-slate-200 pt-4">
            <p className="text-sm font-semibold text-slate-700">Add another micronutrient</p>
            <p className="mt-0.5 text-xs text-slate-500">Include the unit in the name, for example magnesium_mg or vitamin_b12_mcg.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_160px_auto]">
              <input
                value={newNutrientName}
                onChange={(event) => setNewNutrientName(event.target.value)}
                placeholder="magnesium_mg"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={newNutrientAmount}
                onChange={(event) => setNewNutrientAmount(event.target.value)}
                placeholder="Amount"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
              />
              <button type="button" onClick={addMicronutrient} className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100">
                Add nutrient
              </button>
            </div>
            {nutrientError && <p className="mt-2 text-xs text-red-600">{nutrientError}</p>}
          </div>
        </details>

        {Object.keys(errors).length > 0 && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            Check the highlighted meal information before saving.
          </p>
        )}

        {saveMutation.isError && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {getApiErrorMessage(saveMutation.error)}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            disabled={saveMutation.isPending}
            className="rounded-lg bg-emerald-600 px-5 py-2.5 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saveMutation.isPending
              ? "Saving..."
              : editingEntry
                ? "Update meal"
                : "Save meal"}
          </button>
          <button
            type="button"
            onClick={clearForm}
            className="rounded-lg border border-slate-300 px-5 py-2.5 font-semibold text-slate-700 hover:bg-slate-50"
          >
            Clear form
          </button>
        </div>
      </form>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Entries</h2>
            <p className="mt-1 text-sm text-slate-500">
              {entriesQuery.data?.pagination.total ?? 0} matching entries
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setMealType("");
              setSearchText("");
              setStartDate("");
              setEndDate("");
              setPage(1);
            }}
            className="text-sm font-semibold text-emerald-700 hover:text-emerald-800"
          >
            Clear filters
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm font-medium text-slate-700 lg:col-span-2">
            Search food
            <input
              type="search"
              value={searchText}
              onChange={(event) => {
                setSearchText(event.target.value);
                setPage(1);
              }}
              placeholder="Search by food name"
              className={inputClass}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Meal type
            <select
              value={mealType}
              onChange={(event) => {
                setMealType(event.target.value as MealType | "");
                setPage(1);
              }}
              className={inputClass}
            >
              <option value="">All meals</option>
              {mealTypes.map((type) => (
                <option key={type} value={type}>
                  {titleCase(type)}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            From
            <input
              type="date"
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                setPage(1);
              }}
              className={inputClass}
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            To
            <input
              type="date"
              value={endDate}
              onChange={(event) => {
                setEndDate(event.target.value);
                setPage(1);
              }}
              className={inputClass}
            />
          </label>
        </div>

        <div className="mt-3 flex justify-end">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
            Rows per page
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </label>
        </div>

        {invalidDateRange && (
          <p className="mt-3 text-sm text-red-600">
            The end date must be on or after the start date.
          </p>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Calories", Math.round(filteredTotals.calories), "kcal"],
            ["Protein", filteredTotals.protein_g.toFixed(1), "g"],
            ["Carbs", filteredTotals.carbs_g.toFixed(1), "g"],
            ["Fat", filteredTotals.fat_g.toFixed(1), "g"],
          ].map(([label, value, unit]) => (
            <div key={label} className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {label} in filtered results
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-950">
                {value} <span className="text-sm font-medium">{unit}</span>
              </p>
            </div>
          ))}
        </div>

        {entriesQuery.isLoading && (
          <p className="mt-6 animate-pulse text-slate-500">Loading entries...</p>
        )}

        {entriesQuery.isError && (
          <p className="mt-6 rounded-lg bg-red-50 p-3 text-red-700">
            {getApiErrorMessage(entriesQuery.error)}
          </p>
        )}

        {deleteMutation.isError && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {getApiErrorMessage(deleteMutation.error)}
          </p>
        )}

        <div className="mt-6 space-y-6">
          {mealTypes.map((group) => {
            const entries = (entriesQuery.data?.items ?? []).filter(
              (entry) => entry.meal_type === group,
            );
            if (entries.length === 0) return null;
            return (
              <section key={group}>
                <div className="mb-2 flex items-center gap-3">
                  <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{titleCase(group)}</h3>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{entries.length}</span>
                  <span className="h-px flex-1 bg-slate-100" />
                </div>
                <div className="space-y-3">
                  {entries.map((entry) => {
                    const nutrients = Object.entries(entry.micronutrients).filter(([, amount]) => amount > 0);
                    return (
                      <article key={entry.id} className="rounded-xl border border-slate-200 p-4 transition hover:border-slate-300 hover:shadow-sm">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <h4 className="truncate font-bold text-slate-950">{entry.food_name}</h4>
                            <p className="mt-1 text-sm text-slate-500">
                              {formatDateTime(entry.consumed_at)} · {entry.quantity_value} {entry.quantity_unit}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs">
                              <span className="rounded-lg bg-emerald-50 px-2.5 py-1 font-bold text-emerald-700">{entry.calories} kcal</span>
                              <span className="rounded-lg bg-blue-50 px-2.5 py-1 font-semibold text-blue-700">Protein {entry.protein_g}g</span>
                              <span className="rounded-lg bg-sky-50 px-2.5 py-1 font-semibold text-sky-700">Carbs {entry.carbs_g}g</span>
                              <span className="rounded-lg bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">Fat {entry.fat_g}g</span>
                            </div>
                            {nutrients.length > 0 && (
                              <details className="mt-3">
                                <summary className="cursor-pointer text-xs font-semibold text-violet-700">View {nutrients.length} micronutrients</summary>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {nutrients.map(([name, amount]) => (
                                    <span key={name} className="rounded-md bg-violet-50 px-2 py-1 text-[11px] capitalize text-violet-700">
                                      {name.replaceAll("_", " ")}: {amount}
                                    </span>
                                  ))}
                                </div>
                              </details>
                            )}
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <button type="button" onClick={() => beginEditing(entry)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Edit</button>
                            <button
                              type="button"
                              disabled={deleteMutation.isPending && deleteMutation.variables === entry.id}
                              onClick={() => {
                                if (window.confirm(`Delete ${entry.food_name}?`)) deleteMutation.mutate(entry.id);
                              }}
                              className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              {deleteMutation.isPending && deleteMutation.variables === entry.id ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        {!entriesQuery.isLoading && entriesQuery.data?.items.length === 0 && (
          <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-10 text-center">
            <h3 className="font-semibold text-slate-800">No entries found</h3>
            <p className="mt-1 text-sm text-slate-500">
              Adjust the filters or add your first meal above.
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
          <button
            type="button"
            disabled={!entriesQuery.data?.pagination.has_previous}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>

          <span className="text-sm text-slate-600">
            Page {page} of {entriesQuery.data?.pagination.total_pages || 1}
          </span>

          <button
            type="button"
            disabled={!entriesQuery.data?.pagination.has_next}
            onClick={() => setPage((current) => current + 1)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </section>
    </section>
  );
}
