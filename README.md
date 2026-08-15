<div align="center">

# Personal Calorie Tracker

### Understand every meal. Track every target. Build healthier habits.

A full-stack nutrition platform with private user accounts, flexible nutrient tracking,
interactive reports, Gemini-powered food analysis, PDF imports, and a conversational
nutrition assistant.

</div>

## Product demo

<video src="https://raw.githubusercontent.com/Koushikroyal2005/PersonalCalorieTracker/main/docs/calorie-tracker-demo.mp4" controls width="100%">
  Your browser does not support embedded video. Use the link below to watch the demo.
</video>

### [▶ Play the full application demo](https://raw.githubusercontent.com/Koushikroyal2005/PersonalCalorieTracker/main/docs/calorie-tracker-demo.mp4)

> GitHub clients that do not render the embedded player can use the play link above or
> download [the MP4 from the repository](./docs/calorie-tracker-demo.mp4).

## What the application delivers

- Secure multi-user registration and login with JWT authentication
- Private meal, goal, report, import, and chat data scoped to each account
- Breakfast, lunch, dinner, and snack logging with full CRUD operations
- Quantity, calories, macros, and an open-ended micronutrient dictionary
- Date range, meal type, search, page size, and pagination controls
- Create, edit, activate, deactivate, and delete personal health goals
- Global dashboard time range with independent per-chart overrides
- Calorie trends, macro breakdowns, dynamic micronutrient totals, and goal progress
- Gemini image analysis for nutrition labels and plated-food photographs
- Gemini PDF extraction with editable preview and selective bulk import
- NutriX AI chat for meal logging, food history, summaries, goals, and confirmed actions
- Draggable floating assistant with image/PDF upload and cross-page review workflows

## System architecture

```mermaid
flowchart LR
    U[User] --> B[Browser]

    subgraph FE[React frontend]
        R[React Router]
        P[Feature pages]
        C[React Query API cache]
        S[Redux authentication state]
        W[NutriX chat widget]
        R --> P
        P --> C
        W --> C
        S --> C
    end

    B --> R
    C -->|REST + JSON / multipart| API

    subgraph BE[FastAPI backend]
        API[API routes]
        M[Auth and error middleware]
        SV[Application services]
        V[Pydantic validation]
        API --> M
        M --> V
        V --> SV
    end

    SV -->|Async queries| DB[(MongoDB)]
    SV -->|Structured generation| AI[Google Gemini]
```

The frontend never connects directly to MongoDB or Gemini. Every operation passes through
the authenticated FastAPI contract, keeping secrets and persistence logic on the server.

## Frontend design and flow

```mermaid
flowchart TD
    START[Application starts] --> AUTH{JWT available?}
    AUTH -->|No| LOGIN[Login / signup]
    AUTH -->|Yes| SHELL[Protected application layout]

    SHELL --> DASH[Dashboard]
    SHELL --> FOOD[Food log]
    SHELL --> GOALS[Goals]
    SHELL --> PDF[PDF import]
    SHELL --> CHAT[Floating NutriX AI]

    DASH --> FILTER[Global and local date filters]
    FILTER --> CHARTS[Calories, macros, micros, goal progress]

    FOOD --> FORM[Manual or AI-prefilled meal form]
    FORM --> REVIEW[Review and edit]
    REVIEW --> SAVE[Save through entries API]

    CHAT --> NAV[Open the relevant review page]
    NAV --> FORM
    NAV --> PDF
    NAV --> GOALS
```

### Frontend responsibilities

| Layer | Responsibility |
| --- | --- |
| Pages | Dashboard, meal management, goals, PDF review, login, and signup experiences |
| Feature API modules | Typed HTTP functions for auth, entries, goals, reports, uploads, imports, and chat |
| React Query | Server-state fetching, caching, pagination, mutation state, and invalidation |
| Redux Toolkit | Persistent authentication/session state |
| React Hook Form + Zod | Form state, input conversion, and client-side validation |
| Shared chat context | Keeps AI import/goal proposals alive while navigating to review pages |
| React Router | Protected routes, lazy page loading, and cross-feature navigation |

## Backend low-level design

```mermaid
flowchart TD
    REQ[HTTP request] --> ROUTE[FastAPI route]
    ROUTE --> AUTH[Current-user dependency]
    AUTH --> SCHEMA[Pydantic request schema]
    SCHEMA --> SERVICE[Application service]

    SERVICE --> ENTRY[Entry service]
    SERVICE --> GOAL[Goal service]
    SERVICE --> REPORT[Report service]
    SERVICE --> CHAT[Chat orchestration]
    SERVICE --> MEDIA[Image / PDF extraction]

    ENTRY --> MONGO[(MongoDB collections)]
    GOAL --> MONGO
    REPORT --> MONGO
    CHAT --> MONGO
    CHAT --> GEMINI[Gemini API]
    MEDIA --> GEMINI

    MONGO --> SERIALIZE[Serialization and response schema]
    GEMINI --> VALIDATE[Structured output validation]
    VALIDATE --> SERIALIZE
    SERIALIZE --> RES[JSON response]

    ROUTE -. exception .-> ERR[Central error handler]
    ERR --> ERES[Consistent error envelope]
```

### Backend responsibilities

| Layer | Responsibility |
| --- | --- |
| `api/routes` | HTTP contracts, authentication dependencies, upload limits, and status codes |
| `schemas` | Request/response validation, enums, date rules, and safe numeric boundaries |
| `application/services` | Business rules, pagination, reports, AI orchestration, and action confirmation |
| `infrastructure` | MongoDB lifecycle, indexes, and database access |
| `core` | Settings, JWT/password security, and application configuration |
| `api/middlewares` | Uniform error handling without exposing internal details |

## AI-assisted workflows

### Image or nutrition-label extraction

```mermaid
sequenceDiagram
    actor User
    participant UI as Food Log / Chat
    participant API as Upload API
    participant AI as Gemini Vision
    participant Form as Editable preview
    participant DB as MongoDB

    User->>UI: Upload JPEG, PNG, or WebP
    UI->>API: Multipart image
    API->>API: Validate size and real image format
    API->>AI: Request structured nutrition extraction
    AI-->>API: Calories, macros, micros, confidence
    API-->>Form: Prefill meal and current date
    User->>Form: Review, edit, or change date
    User->>UI: Confirm save
    UI->>API: Create food entry
    API->>DB: Persist under authenticated user
```

### PDF bulk import

```mermaid
sequenceDiagram
    actor User
    participant UI as PDF review page
    participant API as PDF import API
    participant AI as Gemini document analysis
    participant DB as MongoDB

    User->>UI: Upload food-diary PDF
    UI->>API: POST /imports/pdf/preview
    API->>API: Validate PDF and 10 MB limit
    API->>AI: Extract structured meal rows
    AI-->>UI: Editable preview + warnings
    User->>UI: Select and correct entries
    UI->>API: POST /imports/pdf/confirm
    API->>DB: Bulk-create selected entries
    API-->>UI: Imported count and entry IDs
```

### Conversational action flow

```mermaid
sequenceDiagram
    actor User
    participant Chat as NutriX widget
    participant API as Chat API
    participant AI as Gemini
    participant Action as Pending-action service
    participant DB as MongoDB

    User->>Chat: Natural-language request
    Chat->>API: Message + conversation ID
    API->>AI: Intent and structured values
    alt Read-only question
        API->>DB: Read entries, goals, or reports
        API-->>Chat: Context-aware answer
    else Data-changing action
        API->>Action: Store pending proposal
        API-->>Chat: Preview and request confirmation
        User->>Chat: Confirm
        Chat->>API: Confirm action
        API->>DB: Apply meal or goal mutation
        API-->>Chat: Completed result
    end
```

The same assistant can open Food Log, Goals, or PDF Import while remaining visible. The
review page owns the editable form; chat confirmation saves the values currently shown in
that form rather than stale AI output.

## MongoDB document model

MongoDB is used because food micronutrients are naturally sparse and extensible. An entry
can store `magnesium_mg`, `potassium_mg`, `vitamin_b12_mcg`, or any future nutrient without
requiring a schema migration.

```mermaid
erDiagram
    USER ||--o{ FOOD_ENTRY : owns
    USER ||--o{ GOAL : owns
    USER ||--o{ CONVERSATION : starts
    CONVERSATION ||--o{ CHAT_MESSAGE : contains
    CONVERSATION ||--o{ CHAT_ACTION : proposes

    USER {
        ObjectId id
        string email
        string full_name
        string password_hash
        datetime created_at
    }

    FOOD_ENTRY {
        ObjectId id
        string user_id
        string meal_type
        string food_name
        float quantity_value
        string quantity_unit
        int calories
        float protein_g
        float carbs_g
        float fat_g
        object micronutrients
        datetime consumed_at
    }

    GOAL {
        ObjectId id
        string user_id
        string goal_type
        int daily_calorie_target
        float daily_protein_target_g
        float daily_carbs_target_g
        float daily_fat_target_g
        float target_weight_kg
        date start_date
        date end_date
        boolean is_active
    }

    CONVERSATION {
        ObjectId id
        string user_id
        string title
        datetime updated_at
    }

    CHAT_MESSAGE {
        ObjectId id
        string conversation_id
        string role
        string message_type
        object metadata
    }

    CHAT_ACTION {
        ObjectId id
        string conversation_id
        string action_type
        string status
        object payload
    }
```

Relationships are enforced by authenticated `user_id` filters in the service layer. Goal
activation is exclusive: activating one goal automatically deactivates the user’s other goal.

## Technology stack

| Area | Technologies |
| --- | --- |
| Frontend | React, TypeScript, Vite, Tailwind CSS, React Router |
| State and forms | TanStack React Query, Redux Toolkit, React Hook Form, Zod |
| Charts | Recharts |
| Backend | Python, FastAPI, Pydantic, Uvicorn |
| Database | MongoDB with asynchronous PyMongo access |
| Authentication | JWT, Argon2 password hashing |
| AI | Google Gemini structured text, vision, and document analysis |
| Quality | Ruff, Pytest, TypeScript compiler, Oxlint |

## Repository structure

```text
PersonalCalorieTracker/
├── backend/
│   ├── app/
│   │   ├── api/                 # Routes, dependencies, middleware
│   │   ├── application/services # Business and AI orchestration
│   │   ├── core/                # Configuration and security
│   │   ├── infrastructure/      # MongoDB connection and indexes
│   │   ├── schemas/             # Pydantic contracts
│   │   └── main.py              # FastAPI application
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/          # Layout, forms, auth, NutriX widget
│   │   ├── features/            # Feature API clients and shared state
│   │   ├── pages/               # Dashboard, logs, goals, imports, auth
│   │   ├── services/            # Axios configuration
│   │   └── types/               # TypeScript API models
│   └── package.json
├── docs/
│   ├── calorie-tracker-demo.mp4
│   └── sample-food-diary.pdf
└── README.md
```

## Getting started

### Prerequisites

- Python 3.13+
- Node.js 22+
- MongoDB Atlas cluster or local MongoDB
- Gemini API key from [Google AI Studio](https://aistudio.google.com/)

### 1. Start the backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Configure `backend/.env`:

```env
MONGODB_URL=mongodb+srv://USERNAME:PASSWORD@CLUSTER/
MONGODB_DATABASE=personal_calorie_tracker
JWT_SECRET_KEY=replace-with-a-long-random-secret
GEMINI_API_KEY=your-google-ai-studio-key
FRONTEND_URL=http://localhost:5173
```

If the MongoDB password contains reserved URL characters, URL-encode them. For example,
`@` becomes `%40`. Never commit `.env`.

```powershell
uvicorn app.main:app --reload
```

- API base URL: `http://127.0.0.1:8000/api`
- Interactive API documentation: `http://127.0.0.1:8000/docs`

### 2. Start the frontend

Open another terminal:

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local
npm.cmd run dev
```

Open `http://localhost:5173`.

## API overview

All private endpoints require `Authorization: Bearer <token>`.

| Area | Main endpoints |
| --- | --- |
| Authentication | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/profile` |
| Food entries | `POST/GET /api/entries`, `GET/PUT/DELETE /api/entries/{id}` |
| Goals | `POST/GET /api/goals`, `PUT/DELETE /api/goals/{id}`, `PATCH /api/goals/{id}/activate` |
| Reports | `GET /api/reports/calorie-trend`, `/macro-breakdown`, `/micro-summary`, `/goal-comparison` |
| Image AI | `POST /api/upload/image` |
| PDF import | `POST /api/imports/pdf/preview`, `POST /api/imports/pdf/confirm` |
| Chat | Conversations, paginated messages, send message, confirm action, and cancel action |

Every collection-style API is paginated. Food entries additionally support date range, meal
type, and text-search filters.

## Validation and safety

- Passwords are hashed and never returned by the API.
- JWT authentication scopes every query and mutation to the current user.
- Image contents are verified with Pillow; filename extensions alone are not trusted.
- Images are limited to 8 MB and PDFs to 10 MB.
- AI output is parsed into strict Pydantic schemas before it reaches application state.
- AI-generated meals and data-changing chat actions require user review or confirmation.
- Central error handling returns consistent messages without leaking stack traces.
- `.env`, virtual environments, dependencies, generated builds, and local uploads are ignored.

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

## Important assumptions

- AI nutrition values for plated food are estimates and should be reviewed before saving.
- Nutrient keys contain their units because measurements use different scales.
- Custom report dates are interpreted as calendar days in India Standard Time.
- A user may store many goals, but only one goal is active at a time.
- PDF imports use a preview/confirm workflow so imperfect source rows can be corrected.

## License

This repository is currently provided for project evaluation and demonstration purposes.
