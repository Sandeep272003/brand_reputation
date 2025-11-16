# Brand Mention & Reputation Tracker — Single Integrated File (Node.js)

This project implements a **Brand Mention & Reputation Tracker** as a *single integrated Node.js file* (`server.js`) that contains both the backend (Express + Socket.IO) and the frontend HTML/CSS/JS. It simulates real-time brand mentions, runs sentiment analysis, clusters topics, detects spikes, and provides a polished dashboard UI.

## Why this format?
- Single-file server makes it extremely quick to run and deploy.
- No build step for the frontend — uses CDN scripts for Tailwind and Chart.js.
- Lightweight dependencies: Express + Socket.IO only.

## Features
- Real-time mentions stream (simulated) via WebSockets.
- Sentiment analysis (simple rule-based) with scores and labels.
- Topic clustering (simple TF-based cosine similarity).
- Spike detection with alerts.
- Interactive dashboard with charts and filters.
- Advanced styling using Tailwind CSS CDN + subtle animations.

## Files
- `server.js` — single integrated server + frontend.
- `package.json` — dependencies and start script.
- `README.md` — this file.

## Quick start (Linux / macOS / Windows)
1. Unzip the archive.
2. Install dependencies:
   ```
   npm install
   ```
3. Start the server:
   ```
   npm start
   ```
4. Open your browser at `http://localhost:3000`

## Deployment
- This single-file app can be deployed to services like Render, Fly.io, Railway, or any VPS supporting Node.js.
- For production, consider adding rate-limiting, real data ingestion sources, and persistence (database).

## Notes
- The mention stream is simulated for offline/hackathon use. Replace the simulator with real scrapers / APIs for production.
- The sentiment analyzer is lightweight and intended for demonstration; swap in an ML model or external API for higher accuracy.

Enjoy — and good luck with the hackathon! 🚀
