export type ReportPeriod = "7d" | "30d" | "90d";
export type ReportView = "daily" | "weekly";

export interface ReportRange {
  period?: ReportPeriod;
  startDate?: string;
  endDate?: string;
}

export interface CalorieTrend {
  points: Array<{
    period: string;
    calories: number;
  }>;
}

export interface MacroTrend {
  points: Array<{
    period: string;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  }>;
}

export interface MicronutrientSummary {
  nutrients: Array<{
    name: string;
    amount: number;
  }>;
}

export interface GoalMetric {
  target: number;
  actual: number;
  remaining: number;
  percentage: number;
}

export interface GoalComparison {
  date: string;
  end_date: string | null;
  has_active_goal: boolean;
  calories: GoalMetric | null;
  protein_g: GoalMetric | null;
  carbs_g: GoalMetric | null;
  fat_g: GoalMetric | null;
}
