import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import {
  confirmPDFImport,
  previewPDFImport,
} from "../features/imports/pdfImportApi";
import { useChatImport } from "../features/chat/chatImportContext";
import type { EntryInput, MealType } from "../types/entry";
import type {
  PDFExtractedEntry,
  PDFImportConfirmRequest,
  PDFImportPreview,
} from "../types/pdfImport";
import { getApiErrorMessage } from "../utils/apiError";

const mealTypes: MealType[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snacks",
];

const maximumBytes = 10 * 1024 * 1024;

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 " +
  "text-sm outline-none focus:border-emerald-500 " +
  "focus:ring-2 focus:ring-emerald-100";

function localDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const adjusted = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );

  return adjusted.toISOString().slice(0, 16);
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatNutrientName(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isValidEntry(entry: PDFExtractedEntry): boolean {
  return Boolean(
    entry.food_name.trim() &&
      entry.quantity_value > 0 &&
      entry.quantity_unit.trim() &&
      entry.calories >= 0 &&
      entry.protein_g >= 0 &&
      entry.carbs_g >= 0 &&
      entry.fat_g >= 0 &&
      !Number.isNaN(new Date(entry.consumed_at).getTime()),
  );
}

export function PDFImportPage() {
  const queryClient = useQueryClient();
  const {
    pendingImport,
    registerSaveHandler,
    completePending,
  } = useChatImport();
  const appliedChatImport = useRef<string | null>(null);

  const [document, setDocument] = useState<File | null>(null);
  const [preview, setPreview] =
    useState<PDFImportPreview | null>(null);
  const [selectedRows, setSelectedRows] =
    useState<Set<number>>(new Set());
  const [validationError, setValidationError] =
    useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const previewMutation = useMutation({
    mutationFn: previewPDFImport,
    onSuccess: (result) => {
      setPreview(result);
      setSelectedRows(
        new Set(result.entries.map((entry) => entry.row_number)),
      );
      setPage(1);
    },
  });

  const confirmMutation = useMutation({
    mutationFn: confirmPDFImport,
    onSuccess: async (result) => {
      if (pendingImport?.kind === "pdf") {
        completePending(
          `Saved successfully. I imported ${result.imported_count} entries into your food log.`,
        );
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["entries"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["reports"],
        }),
      ]);
    },
  });

  const selectedEntries = useMemo(() => {
    return (
      preview?.entries.filter((entry) =>
        selectedRows.has(entry.row_number),
      ) ?? []
    );
  }, [preview, selectedRows]);

  const invalidSelectedEntries = selectedEntries.filter(
    (entry) => !isValidEntry(entry),
  );

  const totalPages = preview
    ? Math.max(
        1,
        Math.ceil(preview.entries.length / pageSize),
      )
    : 1;

  const visibleEntries = preview?.entries.slice(
    (page - 1) * pageSize,
    page * pageSize,
  ) ?? [];

  function selectDocument(file?: File) {
    setValidationError(null);
    previewMutation.reset();
    confirmMutation.reset();
    setPreview(null);
    setSelectedRows(new Set());
    setPage(1);

    if (!file) {
      setDocument(null);
      return;
    }

    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      setDocument(null);
      setValidationError("Select a PDF file.");
      return;
    }

    if (file.size > maximumBytes) {
      setDocument(null);
      setValidationError("The PDF must not exceed 10 MB.");
      return;
    }

    setDocument(file);
  }

  function updateEntry(
    rowNumber: number,
    updates: Partial<PDFExtractedEntry>,
  ) {
    setPreview((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        entries: current.entries.map((entry) =>
          entry.row_number === rowNumber
            ? { ...entry, ...updates }
            : entry,
        ),
      };
    });
  }

  function toggleRow(rowNumber: number) {
    setSelectedRows((current) => {
      const updated = new Set(current);

      if (updated.has(rowNumber)) {
        updated.delete(rowNumber);
      } else {
        updated.add(rowNumber);
      }

      return updated;
    });
  }

  function toggleVisibleRows() {
    const visibleRowNumbers = visibleEntries.map(
      (entry) => entry.row_number,
    );

    const allVisibleSelected = visibleRowNumbers.every(
      (rowNumber) => selectedRows.has(rowNumber),
    );

    setSelectedRows((current) => {
      const updated = new Set(current);

      for (const rowNumber of visibleRowNumbers) {
        if (allVisibleSelected) {
          updated.delete(rowNumber);
        } else {
          updated.add(rowNumber);
        }
      }

      return updated;
    });
  }

  function confirmImport() {
    if (selectedEntries.length === 0) {
      setValidationError(
        "Select at least one food entry to import.",
      );
      return;
    }

    if (invalidSelectedEntries.length > 0) {
      setValidationError(
        "Correct the invalid selected entries before importing.",
      );
      return;
    }

    setValidationError(null);

    confirmMutation.mutate(buildImportRequest());
  }

  const buildImportRequest = useCallback((): PDFImportConfirmRequest => {
    const entries: EntryInput[] = selectedEntries.map(
      (entry) => ({
        meal_type: entry.meal_type,
        food_name: entry.food_name.trim(),
        quantity_value: entry.quantity_value,
        quantity_unit: entry.quantity_unit.trim(),
        calories: Math.round(entry.calories),
        protein_g: entry.protein_g,
        carbs_g: entry.carbs_g,
        fat_g: entry.fat_g,
        micronutrients: entry.micronutrients,
        consumed_at: new Date(entry.consumed_at).toISOString(),
      }),
    );
    return { entries };
  }, [selectedEntries]);

  useEffect(() => {
    if (
      pendingImport?.kind !== "pdf" ||
      appliedChatImport.current === pendingImport.id
    ) {
      return;
    }

    appliedChatImport.current = pendingImport.id;
    setDocument(null);
    setPreview(pendingImport.preview);
    setSelectedRows(
      new Set(pendingImport.preview.entries.map((entry) => entry.row_number)),
    );
    setValidationError(null);
    setPage(1);
    previewMutation.reset();
    confirmMutation.reset();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [pendingImport, previewMutation, confirmMutation]);

  useEffect(() => {
    if (pendingImport?.kind !== "pdf") {
      registerSaveHandler(null);
      return;
    }

    registerSaveHandler(async () => {
      if (selectedEntries.length === 0) {
        throw new Error("Select at least one food entry before importing.");
      }
      if (invalidSelectedEntries.length > 0) {
        throw new Error("Correct the invalid selected entries before importing.");
      }
      await confirmMutation.mutateAsync(buildImportRequest());
    });

    return () => registerSaveHandler(null);
  }, [
    pendingImport,
    registerSaveHandler,
    selectedEntries,
    invalidSelectedEntries,
    confirmMutation,
    buildImportRequest,
  ]);

  function startAnotherImport() {
    setDocument(null);
    setPreview(null);
    setSelectedRows(new Set());
    setValidationError(null);
    setPage(1);
    previewMutation.reset();
    confirmMutation.reset();
  }

  if (confirmMutation.isSuccess) {
    return (
      <section className="mx-auto max-w-3xl">
        <div className="rounded-3xl border border-emerald-200 bg-white p-8 text-center shadow-sm sm:p-12">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-100 text-3xl text-emerald-700">
            ✓
          </span>

          <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">
            Import complete
          </p>

          <h1 className="mt-2 text-3xl font-extrabold text-slate-950">
            {confirmMutation.data.imported_count} entries imported
          </h1>

          <p className="mt-3 text-slate-500">
            Your food log and dashboard reports have been updated.
          </p>

          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              to="/food-log"
              className="rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white"
            >
              View food log
            </Link>

            <button
              type="button"
              onClick={startAnotherImport}
              className="rounded-xl border border-slate-300 px-5 py-3 font-bold text-slate-700"
            >
              Import another PDF
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-7">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">
          Bulk import
        </p>

        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
          Import a food diary
        </h1>

        <p className="mt-2 text-sm text-slate-500">
          Upload a PDF, review the AI-extracted entries, and choose
          exactly what should be saved.
        </p>
      </header>

      {!preview && (
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <label
            className="grid min-h-64 cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 p-8 text-center transition hover:border-emerald-500 hover:bg-emerald-50"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              selectDocument(event.dataTransfer.files[0]);
            }}
          >
            <div>
              <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-white text-2xl font-black text-emerald-700 shadow-sm">
                PDF
              </span>

              <h2 className="mt-5 text-lg font-bold text-slate-900">
                Drop your food diary PDF here
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                or click to select a file · maximum 10 MB
              </p>

              {document && (
                <div className="mx-auto mt-5 max-w-sm rounded-xl border border-emerald-200 bg-white px-4 py-3">
                  <p className="truncate text-sm font-bold text-slate-800">
                    {document.name}
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    {(document.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              )}
            </div>

            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={(event) =>
                selectDocument(event.target.files?.[0])
              }
              className="sr-only"
            />
          </label>

          {validationError && (
            <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {validationError}
            </p>
          )}

          {previewMutation.isError && (
            <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {getApiErrorMessage(previewMutation.error)}
            </p>
          )}

          <button
            type="button"
            disabled={!document || previewMutation.isPending}
            onClick={() =>
              document && previewMutation.mutate(document)
            }
            className="mt-5 w-full rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {previewMutation.isPending
              ? "Analyzing PDF with Gemini…"
              : "Analyze and preview"}
          </button>

          {previewMutation.isPending && (
            <p className="mt-3 text-center text-xs text-slate-500">
              Large or scanned PDFs may take up to two minutes.
            </p>
          )}
        </article>
      )}

      {preview && (
        <>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-slate-900">
                  {preview.filename}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  {preview.total_entries} entries found ·{" "}
                  {selectedEntries.length} selected
                </p>
              </div>

              <button
                type="button"
                onClick={startAnotherImport}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600"
              >
                Choose another PDF
              </button>
            </div>

            {preview.warnings.length > 0 && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-bold text-amber-800">
                  Document warnings
                </p>

                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-700">
                  {preview.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </article>

          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 sm:px-6">
              <div>
                <h2 className="font-bold text-slate-900">
                  Review entries
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Edit incorrect values or deselect rows you do not want.
                </p>
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                Rows
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                  className="rounded-lg border border-slate-200 px-2 py-1.5"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[1200px] w-full border-collapse text-left">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label="Select visible rows"
                        checked={
                          visibleEntries.length > 0 &&
                          visibleEntries.every((entry) =>
                            selectedRows.has(entry.row_number),
                          )
                        }
                        onChange={toggleVisibleRows}
                        className="accent-emerald-600"
                      />
                    </th>
                    <th className="px-3 py-3">Food</th>
                    <th className="px-3 py-3">Meal</th>
                    <th className="px-3 py-3">Quantity</th>
                    <th className="px-3 py-3">Date and time</th>
                    <th className="px-3 py-3">Calories</th>
                    <th className="px-3 py-3">Protein</th>
                    <th className="px-3 py-3">Carbs</th>
                    <th className="px-3 py-3">Fat</th>
                    <th className="px-3 py-3">Review</th>
                  </tr>
                </thead>

                <tbody>
                  {visibleEntries.map((entry) => {
                    const valid = isValidEntry(entry);

                    return (
                      <tr
                        key={entry.row_number}
                        className={`border-t border-slate-100 ${
                          selectedRows.has(entry.row_number)
                            ? "bg-white"
                            : "bg-slate-50 opacity-60"
                        }`}
                      >
                        <td className="px-4 py-3 align-top">
                          <input
                            type="checkbox"
                            checked={selectedRows.has(
                              entry.row_number,
                            )}
                            onChange={() =>
                              toggleRow(entry.row_number)
                            }
                            className="mt-2 accent-emerald-600"
                          />
                        </td>

                        <td className="w-56 px-3 py-3 align-top">
                          <input
                            value={entry.food_name}
                            onChange={(event) =>
                              updateEntry(entry.row_number, {
                                food_name: event.target.value,
                              })
                            }
                            className={inputClass}
                          />
                        </td>

                        <td className="w-36 px-3 py-3 align-top">
                          <select
                            value={entry.meal_type}
                            onChange={(event) =>
                              updateEntry(entry.row_number, {
                                meal_type:
                                  event.target.value as MealType,
                              })
                            }
                            className={inputClass}
                          >
                            {mealTypes.map((mealType) => (
                              <option
                                key={mealType}
                                value={mealType}
                              >
                                {titleCase(mealType)}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="w-44 px-3 py-3 align-top">
                          <div className="grid grid-cols-2 gap-1">
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={entry.quantity_value}
                              onChange={(event) =>
                                updateEntry(entry.row_number, {
                                  quantity_value: Number(
                                    event.target.value,
                                  ),
                                })
                              }
                              className={inputClass}
                            />

                            <input
                              value={entry.quantity_unit}
                              onChange={(event) =>
                                updateEntry(entry.row_number, {
                                  quantity_unit:
                                    event.target.value,
                                })
                              }
                              className={inputClass}
                            />
                          </div>
                        </td>

                        <td className="w-52 px-3 py-3 align-top">
                          <input
                            type="datetime-local"
                            value={localDateTime(
                              entry.consumed_at,
                            )}
                            onChange={(event) =>
                              updateEntry(entry.row_number, {
                                consumed_at:
                                  event.target.value,
                              })
                            }
                            className={inputClass}
                          />
                        </td>

                        {(
                          [
                            ["calories", "1"],
                            ["protein_g", "0.01"],
                            ["carbs_g", "0.01"],
                            ["fat_g", "0.01"],
                          ] as const
                        ).map(([field, step]) => (
                          <td
                            key={field}
                            className="w-28 px-3 py-3 align-top"
                          >
                            <input
                              type="number"
                              min="0"
                              step={step}
                              value={entry[field]}
                              onChange={(event) =>
                                updateEntry(entry.row_number, {
                                  [field]: Number(
                                    event.target.value,
                                  ),
                                })
                              }
                              className={inputClass}
                            />
                          </td>
                        ))}

                        <td className="w-44 px-3 py-3 align-top">
                          <div className="space-y-2">
                            <span
                              className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${
                                entry.confidence >= 0.8
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-amber-50 text-amber-700"
                              }`}
                            >
                              {Math.round(
                                entry.confidence * 100,
                              )}
                              % confidence
                            </span>

                            {!valid && (
                              <p className="text-[10px] font-bold text-red-600">
                                Invalid values
                              </p>
                            )}

                            {entry.warnings.length > 0 && (
                              <details>
                                <summary className="cursor-pointer text-[10px] font-bold text-amber-700">
                                  {entry.warnings.length} warnings
                                </summary>

                                <ul className="mt-1 list-disc pl-4 text-[10px] text-amber-700">
                                  {entry.warnings.map((warning) => (
                                    <li key={warning}>
                                      {warning}
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            )}

                            {Object.keys(
                              entry.micronutrients,
                            ).length > 0 && (
                              <details>
                                <summary className="cursor-pointer text-[10px] font-bold text-violet-700">
                                  Micronutrients
                                </summary>

                                <div className="mt-1 space-y-1">
                                  {Object.entries(
                                    entry.micronutrients,
                                  ).map(([name, amount]) => (
                                    <p
                                      key={name}
                                      className="text-[10px] text-violet-700"
                                    >
                                      {formatNutrientName(name)}:{" "}
                                      {amount}
                                    </p>
                                  ))}
                                </div>
                              </details>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 p-4 sm:px-6">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() =>
                  setPage((current) =>
                    Math.max(1, current - 1),
                  )
                }
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold disabled:opacity-40"
              >
                Previous
              </button>

              <span className="text-sm text-slate-500">
                Page {page} of {totalPages}
              </span>

              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() =>
                  setPage((current) =>
                    Math.min(totalPages, current + 1),
                  )
                }
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </article>

          {validationError && (
            <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {validationError}
            </p>
          )}

          {confirmMutation.isError && (
            <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {getApiErrorMessage(confirmMutation.error)}
            </p>
          )}

          <div className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur sm:px-6">
            <div>
              <p className="font-bold text-slate-900">
                {selectedEntries.length} entries selected
              </p>

              <p className="mt-1 text-xs text-slate-500">
                {invalidSelectedEntries.length > 0
                  ? `${invalidSelectedEntries.length} selected entries require correction`
                  : "Ready to import"}
              </p>
            </div>

            <button
              type="button"
              disabled={
                selectedEntries.length === 0 ||
                invalidSelectedEntries.length > 0 ||
                confirmMutation.isPending
              }
              onClick={confirmImport}
              className="rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {confirmMutation.isPending
                ? "Importing entries…"
                : `Import ${selectedEntries.length} entries`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
