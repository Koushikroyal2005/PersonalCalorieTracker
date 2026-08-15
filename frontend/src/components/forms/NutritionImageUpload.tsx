import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { analyzeNutritionImage } from "../../features/upload/uploadApi";
import type { NutritionExtraction } from "../../types/nutritionExtraction";
import { getApiErrorMessage } from "../../utils/apiError";

interface Props {
  onExtracted: (nutrition: NutritionExtraction) => void;
}

const acceptedTypes = ["image/jpeg", "image/png", "image/webp"];
const maximumBytes = 8 * 1024 * 1024;

export function NutritionImageUpload({ onExtracted }: Props) {
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const analysis = useMutation({ mutationFn: analyzeNutritionImage, onSuccess: onExtracted });

  useEffect(() => {
    if (!image) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(image);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  function selectImage(file?: File) {
    setValidationError(null);
    analysis.reset();
    if (!file) {
      setImage(null);
      return;
    }
    if (!acceptedTypes.includes(file.type)) {
      setValidationError("Select a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > maximumBytes) {
      setValidationError("The image must not exceed 8 MB.");
      return;
    }
    setImage(file);
  }

  return (
    <div className="mb-7 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <label
          className="group grid min-h-36 flex-1 cursor-pointer place-items-center overflow-hidden rounded-xl border-2 border-dashed border-emerald-300 bg-white/80 p-5 text-center transition hover:border-emerald-500 hover:bg-white"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            selectImage(event.dataTransfer.files[0]);
          }}
        >
          {previewUrl ? (
            <div className="flex items-center gap-4">
              <img src={previewUrl} alt="Selected meal" className="size-24 rounded-lg object-cover shadow-sm" />
              <div className="min-w-0 text-left">
                <p className="max-w-48 truncate text-sm font-bold text-slate-800">{image?.name}</p>
                <p className="mt-1 text-xs text-slate-500">Click or drop another image to replace</p>
              </div>
            </div>
          ) : (
            <div>
              <span className="mx-auto grid size-11 place-items-center rounded-xl bg-emerald-100 text-xl text-emerald-700">＋</span>
              <p className="mt-3 text-sm font-bold text-slate-800">Drop a meal photo or nutrition label</p>
              <p className="mt-1 text-xs text-slate-500">or click to browse · JPEG, PNG, WebP · max 8 MB</p>
            </div>
          )}
          <input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(event) => selectImage(event.target.files?.[0])} className="sr-only" />
        </label>

        <div className="sm:w-64">
          <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">Gemini assisted</span>
          <h3 className="mt-2 font-bold text-slate-900">Fill the form from a photo</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">AI extracts calories, macros, and visible micronutrients. Review everything before saving.</p>
          <button
            type="button"
            disabled={!image || analysis.isPending}
            onClick={() => image && analysis.mutate(image)}
            className="mt-3 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {analysis.isPending ? "Analyzing image…" : "Analyze and prefill"}
          </button>
        </div>
      </div>

      {validationError && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{validationError}</p>}
      {analysis.isError && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{getApiErrorMessage(analysis.error)}</p>}

      {analysis.data && (
        <div className="mt-4 rounded-xl border border-emerald-100 bg-white p-4 text-sm shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-slate-800">Form prefilled from image</p>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
              {Math.round(analysis.data.confidence * 100)}% confidence
            </span>
          </div>
          {analysis.data.requires_review && <p className="mt-2 font-medium text-amber-700">Please review the estimate carefully before saving.</p>}
          {analysis.data.assumptions.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-slate-500">
              {analysis.data.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
