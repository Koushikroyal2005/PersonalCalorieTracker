export type GoalType = "lose" | "gain" | "maintain";

export interface Goal {
  id: string;
  user_id: string;
  goal_type: GoalType;
  daily_calorie_target: number;
  daily_protein_target_g: number;
  daily_carbs_target_g: number;
  daily_fat_target_g: number;
  target_weight_kg: number | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GoalInput {
  goal_type: GoalType;
  daily_calorie_target: number;
  daily_protein_target_g: number;
  daily_carbs_target_g: number;
  daily_fat_target_g: number;
  target_weight_kg?: number | null;
  start_date: string;
  end_date?: string | null;
  is_active: boolean;
}

export interface PaginatedGoals {
  items: Goal[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_previous: boolean;
  };
}

export type GoalUpdateInput = Partial<GoalInput>;
