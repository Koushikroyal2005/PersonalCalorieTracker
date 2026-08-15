import api from "../../services/api";
import type { NutritionExtraction } from "../../types/nutritionExtraction";

export async function analyzeNutritionImage(
  image: File,
): Promise<NutritionExtraction> {
  const formData = new FormData();
  formData.append("image", image);

  const response = await api.post<NutritionExtraction>(
    "/upload/image",
    formData,
    { timeout: 60_000 },
  );

  return response.data;
}
