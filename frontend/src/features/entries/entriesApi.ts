import api from "../../services/api";
import type {
  EntryInput,
  EntryUpdateInput,
  FoodEntry,
  MealType,
  PaginatedEntries,
} from "../../types/entry";

interface EntryFilters {
  page: number;
  limit: number;
  mealType?: MealType;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export async function fetchEntries(
  filters: EntryFilters,
): Promise<PaginatedEntries> {
  const response = await api.get<PaginatedEntries>("/entries", {
    params: {
      page: filters.page,
      limit: filters.limit,
      meal_type: filters.mealType,
      start_date: filters.startDate,
      end_date: filters.endDate,
      search: filters.search,
    },
  });

  return response.data;
}

export async function createEntry(
  input: EntryInput,
): Promise<FoodEntry> {
  const response = await api.post<FoodEntry>("/entries", input);
  return response.data;
}

export async function deleteEntry(entryId: string): Promise<void> {
  await api.delete(`/entries/${entryId}`);
}

export async function updateEntry(
  entryId: string,
  input: EntryUpdateInput,
): Promise<FoodEntry> {
  const response = await api.put<FoodEntry>(`/entries/${entryId}`, input);
  return response.data;
}
