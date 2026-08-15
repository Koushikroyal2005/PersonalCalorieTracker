export interface NutritionExtraction {
  source_type: "nutrition_label" | "plated_food" | "unknown";
  food_name: string;
  quantity_value: number;
  quantity_unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  micronutrients: Record<string, number>;
  confidence: number;
  assumptions: string[];
  requires_review: boolean;
}
