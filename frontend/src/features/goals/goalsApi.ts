import api from "../../services/api";
import type {
  Goal,
  GoalInput,
  GoalUpdateInput,
  PaginatedGoals,
} from "../../types/goal";

export async function fetchGoals(page = 1, limit = 10): Promise<PaginatedGoals> {
  const response = await api.get<PaginatedGoals>("/goals", {
    params: { page, limit },
  });
  return response.data;
}

export async function createGoal(input: GoalInput): Promise<Goal> {
  const response = await api.post<Goal>("/goals", input);
  return response.data;
}

export async function activateGoal(goalId: string): Promise<Goal> {
  const response = await api.patch<Goal>(
    `/goals/${goalId}/activate`,
    { is_active: true },
  );
  return response.data;
}

export async function deleteGoal(goalId: string): Promise<void> {
  await api.delete(`/goals/${goalId}`);
}

export async function updateGoal(goalId: string, input: GoalUpdateInput): Promise<Goal> {
  const response = await api.put<Goal>(`/goals/${goalId}`, input);
  return response.data;
}
