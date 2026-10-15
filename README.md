# DrawAI Backend

## Requirements

- Node.js 18+
- MongoDB running locally or a MongoDB connection string

## Setup

1. Copy `.env.example` to `.env`.
2. Update `MONGO_URI` if required.
3. Install packages:

```bash
npm install
```

4. Start development server:

```bash
npm run dev
```

Backend runs on:

http://localhost:8000

Health check:

http://localhost:8000/api/health

Before the first round, the host chooses 3–10 rounds, a word-length range of
3–8 letters, and one or more word categories. The server randomly selects
suggestions from its built-in category word bank, so no paid AI service or API
key is required. Each selected word starts a server-timed 60-second round. The
round ends when time runs out or a player guesses correctly; the answer and
result are then shared with the room. The player drawing next starts each
subsequent round. At the configured round limit, everyone sees the final
ranked scores, and the room is deleted.
