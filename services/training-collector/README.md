# Director's Assistant - Dataset Curator

This service helps curate training data for the 2B parameter Director's Assistant model. It searches for filmmaking techniques and prompt engineering guides, then extracts structured JSON training pairs.

## Run Locally

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in `.env` to your Gemini API key
3. Run the app:
   `npm run dev`

## Autonomous Scorer

The `aesthetic_scorer_draft.py` script runs an autonomous loop to judge the collected data using the local Gemma 4 / MAX model on the 5090 engine room.
