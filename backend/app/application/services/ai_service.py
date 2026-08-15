import asyncio

from google import genai
from google.genai import types
from google.genai.errors import APIError, ClientError, ServerError

from app.core.config import get_settings
from app.schemas.nutrition_extraction import NutritionExtractionResponse

EXTRACTION_PROMPT = """
Analyze this image as either a product nutrition label or a plate of food.

Return one JSON object with exactly these fields:
source_type, food_name, quantity_value, quantity_unit, calories, protein_g,
carbs_g, fat_g, micronutrients, confidence, assumptions, requires_review.

Return nutrition values for the quantity shown or the most likely single
serving. For a nutrition label, copy visible values accurately. For plated
food, estimate conservatively and explain assumptions.

Rules:
- Do not invent unreadable label values.
- Return micronutrients as a JSON object with normalized snake_case keys that
  include their unit, for example magnesium_mg, vitamin_b12_mcg, or fiber_g.
- Include every micronutrient that is visible on a label or can be reasonably
  estimated from a plated food. Omit nutrients that are unavailable instead of
  inventing values or returning zero placeholders.
- confidence must be between 0 and 1.
- plated-food estimates must set requires_review to true.
- unclear or incomplete images must set requires_review to true.
- confidence below 0.80 must set requires_review to true.
- food_name should be concise and suitable for a meal log.
- All quantities and nutrition values must be non-negative.
- assumptions must always be a JSON array of strings.
- source_type must be exactly nutrition_label, plated_food, or unknown.
- Return JSON only.
"""


class AIService:
    async def extract_nutrition(
        self,
        image_bytes: bytes,
        mime_type: str,
    ) -> NutritionExtractionResponse:
        settings = get_settings()

        client = genai.Client(api_key=settings.gemini_api_key)
        async_client = client.aio
        last_api_error: APIError | None = None
        last_validation_error: ValueError | None = None
        models = list(
            dict.fromkeys(
                [settings.gemini_model, settings.gemini_fallback_model]
            )
        )

        try:
            for model in models:
                for attempt in range(2):
                    try:
                        response = await async_client.models.generate_content(
                            model=model,
                            contents=[
                                types.Part.from_bytes(
                                    data=image_bytes,
                                    mime_type=mime_type,
                                ),
                                EXTRACTION_PROMPT,
                            ],
                            config=types.GenerateContentConfig(
                                automatic_function_calling=(
                                    types.AutomaticFunctionCallingConfig(
                                        disable=True,
                                    )
                                ),
                                response_mime_type="application/json",
                                temperature=0,
                            ),
                        )

                        if not response.text:
                            raise ValueError("Gemini returned an empty response")

                        try:
                            extraction = (
                                NutritionExtractionResponse.model_validate_json(
                                    response.text
                                )
                            )
                            if extraction.confidence < 0.8:
                                extraction.requires_review = True
                            return extraction
                        except ValueError as error:
                            last_validation_error = error
                            if attempt == 0:
                                await asyncio.sleep(0.5)
                    except ServerError as error:
                        last_api_error = error
                        if attempt == 0:
                            await asyncio.sleep(1)
                    except ClientError as error:
                        last_api_error = error
                        break
        finally:
            await async_client.aclose()
            client.close()

        if last_validation_error is not None:
            raise last_validation_error

        if last_api_error is not None:
            raise last_api_error

        raise ValueError("Gemini returned no response")


ai_service = AIService()
