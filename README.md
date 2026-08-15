# Personal Calorie Tracker

A full-stack nutrition application for logging meals, tracking flexible macro and micronutrient data, managing health goals, viewing time-based reports, and extracting nutrition from images with Gemini.

## Features

- Private multi-user accounts with JWT authentication
- Breakfast, lunch, dinner, and snack entries
- Manual entry plus Gemini image analysis for labels and plated food
- Flexible MongoDB micronutrient objects (for example `magnesium_mg` and `vitamin_b12_mcg`)
- Search, meal/date filters, editable entries, filtered totals, and API pagination
- Create, edit, activate, delete, and paginate health goals
- Global dashboard date filter plus independent per-chart date overrides
- Daily/weekly calorie and macronutrient trends, dynamic micronutrient totals, and goal comparisons
- Consistent validation and structured API errors

## Architecture

```text
React + TypeScript + React Query + Redux
                  |
             REST / JSON
                  |
FastAPI routes -> application services -> MongoDB Atlas
                  |
           Google Gemini API
```

The frontend communicates exclusively through the backend API. User data, goals, and meal entries are stored in MongoDB and scoped by authenticated user ID.

## Prerequisites

- Python 3.13+
- Node.js 22+
- MongoDB Atlas cluster or local MongoDB
- Gemini API key from Google AI Studio

## Backend setup

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Update `backend/.env`:

```env
MONGODB_URL=mongodb+srv://USERNAME:PASSWORD@CLUSTER/
MONGODB_DATABASE=personal_calorie_tracker
JWT_SECRET_KEY=replace-with-a-long-random-secret
GEMINI_API_KEY=your-google-ai-studio-key
FRONTEND_URL=http://localhost:5173
```

If the MongoDB password contains reserved URL characters such as `@`, URL-encode them (`@` becomes `%40`). Never commit `.env`.

Run the API:

```powershell
uvicorn app.main:app --reload
```

API documentation is available at `http://127.0.0.1:8000/docs`.

## Frontend setup

In a second terminal:

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local
npm.cmd run dev
```

Open `http://localhost:5173`.

## Verification

```powershell
# Backend
cd backend
.\.venv\Scripts\ruff.exe check app tests
.\.venv\Scripts\python.exe -m pytest

# Frontend
cd frontend
npm.cmd run lint
npm.cmd run build
```

## API overview

All protected endpoints require `Authorization: Bearer <token>`.

| Area | Endpoints |
| --- | --- |
| Authentication | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/profile` |
| Food entries | `POST/GET /api/entries`, `GET/PUT/DELETE /api/entries/{id}` |
| Goals | `POST/GET /api/goals`, `PUT/DELETE /api/goals/{id}`, `PATCH /api/goals/{id}/activate` |
| Reports | `/api/reports/calorie-trend`, `/macro-breakdown`, `/micro-summary`, `/goal-comparison` |
| AI extraction | `POST /api/upload/image` |

Collection endpoints support `page` and `limit`. Food entries additionally support `meal_type`, `search`, `start_date`, and `end_date`.

## Important assumptions

- Nutrient keys include units because nutrients use different measurement scales. Examples: `fiber_g`, `sodium_mg`, and `vitamin_b12_mcg`.
- AI results are estimates and must be reviewed before saving, especially for plated food.
- Custom report dates are interpreted as calendar days in India Standard Time.
- Only one goal can be active for a user at a time.

## Bonus scope

The conversational LLM interface and bulk PDF import are extra-credit features and are not part of the required application workflow implemented here.
