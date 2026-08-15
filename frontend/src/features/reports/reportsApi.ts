import api from "../../services/api";
import type {
  CalorieTrend,
  GoalComparison,
  MacroTrend,
  MicronutrientSummary,
  ReportRange,
  ReportView,
} from "../../types/report";

export async function fetchCalorieTrend(
  range: ReportRange,
  view: ReportView,
): Promise<CalorieTrend> {
  const response = await api.get<CalorieTrend>("/reports/calorie-trend", {
    params: {
      period: range.period ?? "7d",
      view,
      start_date: range.startDate,
      end_date: range.endDate,
    },
  });
  return response.data;
}

export async function fetchMacroTrend(
  range: ReportRange,
  view: ReportView,
): Promise<MacroTrend> {
  const response = await api.get<MacroTrend>("/reports/macro-breakdown", {
    params: {
      period: range.period ?? "7d",
      view,
      start_date: range.startDate,
      end_date: range.endDate,
    },
  });
  return response.data;
}

export async function fetchMicronutrients(
  range: ReportRange,
): Promise<MicronutrientSummary> {
  const response = await api.get<MicronutrientSummary>(
    "/reports/micro-summary",
    {
      params: {
        period: range.period ?? "7d",
        start_date: range.startDate,
        end_date: range.endDate,
      },
    },
  );
  return response.data;
}

export async function fetchGoalComparison(
  range: ReportRange,
): Promise<GoalComparison> {
  const response = await api.get<GoalComparison>(
    "/reports/goal-comparison",
    {
      params: {
        date: range.startDate,
        end_date: range.endDate,
      },
    },
  );
  return response.data;
}
