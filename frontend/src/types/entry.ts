export type MealType = "breakfast" | "lunch" | "dinner" | "snacks";

export interface FoodEntry {
  id: string;
  user_id: string;
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
  created_at: string;
  updated_at: string;
}

export interface EntryInput {
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
}

export type EntryUpdateInput = Partial<EntryInput>;

export interface PaginatedEntries {
  items: FoodEntry[];
  totals: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_previous: boolean;
  };
}
