import type { EntryInput, MealType } from "./entry";

export interface PDFExtractedEntry {
  row_number: number;
  meal_type: MealType;
  food_name: string;
  quantity_value: number;
  quantity_unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  micronutrients: Record<string, number>;
  consumed_at: string;
  confidence: number;
  warnings: string[];
}

export interface PDFImportPreview {
  filename: string;
  total_entries: number;
  entries: PDFExtractedEntry[];
  warnings: string[];
}

export interface PDFImportConfirmRequest {
  entries: EntryInput[];
}

export interface PDFImportResult {
  imported_count: number;
  entry_ids: string[];
}