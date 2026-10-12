---
name: strong-workouts
description: Use when the user asks to review, summarize, plan or log Strong workouts, templates, exercises, personal records or body measurements.
---

# Strong workout workflows

Use the `strong` MCP server for the user's Strong account. It is unofficial and
talks to Strong's private API, or to a CSV export when `STRONG_CSV_PATH` is set
(read-only; write tools are absent in that mode).

## Before anything

- If a tool fails with "No Strong credentials found", tell the user to run
  `npx -y @aulonm/strong-mcp login` in a terminal. Never ask for their password
  in the conversation.
- Call `strong_sync` once at the start of a session if the user may have
  logged workouts in the app since the last sync.

## Analysis

- Start with `strong_training_summary` (1-12 weeks) for progress, volume or
  consistency questions.
- Use `strong_personal_records` for "what's my best" and estimated 1RM. The
  estimate uses Epley and only covers sets of 1-12 reps; say so when it matters.
- Use `strong_list_workouts` / `strong_get_exercise_history` with `since` /
  `until` for a specific period.
- State the date range you used, cite workout dates, and keep observations
  separate from recommendations.
- Weights are in the account's display unit; the `unit` field says which.

## Logging and editing

- Every write changes the user's real account and deletes cannot be undone in
  the app. Summarise what you are about to write and get an explicit yes first.
- Never invent set results. Ask for reps and weight the user actually did.
- Reference exercises by `exerciseId` (from `strong_get_template`,
  `strong_get_workout` or `strong_list_exercises`) or by exact name. If a name
  is rejected as unknown or ambiguous, show the suggestions and ask.
- `strong_update_workout` and `strong_delete_measurement` use inferred request
  shapes. Report their `serverConfirmed` result; if it is not `true`, suggest
  `strong_sync` and checking in the app.

## Prompts

- `weekly-review` runs the analysis flow above.
- `log-from-template` walks through logging a finished workout from a template.
