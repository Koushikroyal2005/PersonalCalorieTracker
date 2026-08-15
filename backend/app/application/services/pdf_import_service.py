import asyncio
from datetime import datetime, timezone

from google import genai
from google.genai import types
from google.genai.errors import APIError, ClientError, ServerError

from app.core.config import get_settings
from app.schemas.pdf_import import PDFExtractionResult

PDF_IMPORT_PROMPT = """
Analyze this PDF as a food diary or nutrition history.

Extract every individual food entry from tables and readable document text.

Return one JSON object with exactly this top-level shape:
{
  "entries": [
    {
      "row_number": 1,
      "meal_type": "breakfast",
      "food_name": "Example food",
      "quantity_value": 1,
      "quantity_unit": "serving",
      "calories": 0,
      "protein_g": 0,
      "carbs_g": 0,
      "fat_g": 0,
      "micronutrients": {"sodium_mg": 0},
      "consumed_at": "2026-01-01T08:00:00+05:30",
      "confidence": 0.9,
      "warnings": []
    }
  ],
  "document_warnings": []
}

Rules:
- Ignore headers, totals, subtotals, daily summaries, and page numbers.
- Return one entry for each individual food item.
- meal_type must be breakfast, lunch, dinner, or snacks.
- Use meal headings or times to determine meal_type.
- If meal type cannot be determined, use snacks and add a warning.
- Do not invent calories or nutrients that are unavailable.
- Use zero for unavailable calories, protein, carbs, or fat and add a warning.
- Return micronutrients as a JSON object with snake_case keys containing units,
  such as sodium_mg, magnesium_mg, fiber_g, or vitamin_b12_mcg.
- Omit unavailable micronutrients.
- Preserve dates from the PDF.
- Every consumed_at value must be ISO 8601 with the +05:30 timezone.
- If a date exists without a time, use:
  breakfast 08:00, lunch 13:00, dinner 19:00, snacks 16:00.
- quantity_value must be greater than zero.
- Use quantity_unit "serving" when quantity information is unavailable.
- confidence must be between 0 and 1.
- Add warnings for inferred or missing values.
- Return no more than 500 entries.
- If no food rows are found, return an empty entries list and explain why in
  document_warnings.
"""


class PDFImportService:
    async def extract_entries(
        self,
        pdf_bytes: bytes,
    ) -> PDFExtractionResult:
        settings = get_settings()
        client = genai.Client(api_key=settings.gemini_api_key)
        async_client = client.aio

        response = None
        last_api_error: APIError | None = None

        models = list(
            dict.fromkeys(
                [
                    settings.gemini_model,
                    settings.gemini_fallback_model,
                ]
            )
        )

        dated_prompt = (
            f"{PDF_IMPORT_PROMPT}\n"
            f"Today's date is {datetime.now(timezone.utc).date().isoformat()}."
        )

        try:
            for model in models:
                for attempt in range(2):
                    try:
                        response = await async_client.models.generate_content(
                            model=model,
                            contents=[
                                types.Part.from_bytes(
                                    data=pdf_bytes,
                                    mime_type="application/pdf",
                                ),
                                dated_prompt,
                            ],
                            config=types.GenerateContentConfig(
                                automatic_function_calling=(
                                    types.AutomaticFunctionCallingConfig(
                                        disable=True,
                                    )
                                ),
                                response_mime_type="application/json",
                            ),
                        )
                        break
                    except ServerError as error:
                        last_api_error = error

                        if attempt == 0:
                            await asyncio.sleep(1)
                    except ClientError as error:
                        # A model can support image analysis while rejecting
                        # PDF input. Move directly to the configured fallback
                        # model for non-retryable request/model errors.
                        last_api_error = error
                        break

                if response is not None:
                    break
        finally:
            await async_client.aclose()
            client.close()

        if response is None:
            if last_api_error is not None:
                raise last_api_error

            raise ValueError("Gemini returned no PDF response")

        if not response.text:
            raise ValueError("Gemini returned an empty PDF response")

        return PDFExtractionResult.model_validate_json(response.text)


pdf_import_service = PDFImportService()
