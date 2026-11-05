# Jumble Word Game 🔤

A modern, full-featured web game where players unscramble jumbled anagrams. Built with a **React 18 + Vite** frontend, a **Node.js + Express** backend, and a real-time **Dictionary API** engine providing unlimited vocabulary, authentic definitions, and grammatical category hints.

---

## 🌟 Key Features

### 📖 Dynamic Dictionary API Engine
- **Infinite Vocabulary:** Replaced static word lists with real-time queries to the **Datamuse API** and **Free Dictionary API** (`dictionaryapi.dev`).
- **Authentic Definitions & Categories:** Real dictionary definitions and grammatical categories (e.g. `Noun • Science & Discovery`, `Adjective • Art & Culture`) are generated dynamically for hints.
- **Smart Difficulty Calibration:**
  - **Easy:** 4–6 letters (common everyday words).
  - **Medium:** 7–8 letters.
  - **Hard:** 9–12 letters.
  - **Random:** Randomized difficulty per word with difficulty badges and point multipliers.
- **Fisher-Yates Jumble Algorithm:** Generates randomized anagrams and guarantees the scrambled letters never match the solution.
- **Zero-Latency In-Memory Pool:** Pre-warms word pools in the background so words load instantaneously ($< 5\text{ ms}$). Includes an offline seed bank for 100% offline resilience.

---

### 🎮 Game Modes

| Mode | Rules & Mechanics |
| :--- | :--- |
| **Casual** | Relaxed and untimed. Wordle-style letter-position feedback (correct letters turn green in place). Streaks disabled. |
| **Speed** | 15-second countdown timer per word. Speed bonus awarded for solving with $\ge 50\%$ time remaining. |
| **Blitz** | 8-second rapid-fire countdown timer per word. Fast-paced streak builder. |
| **Endless** | Play continuously without word limits. Choose between **Untimed**, **1 Minute**, **2 Minutes**, or **Custom Time**. Each correct word adds $+5\text{s}$; each skip subtracts $-5\text{s}$. |
| **Hardcore** | Strict resource management: only 3 skips and 1 of each hint type (Category, Definition, 1st Letter) for the entire run. $+5$ extra points per solve. |

---

### 📊 Performance & Tries Tracking
- **Attempt Tracking:** Records every submitted attempt on each word.
- **Round Accuracy:** Calculates solve accuracy based on $\frac{\text{Correct Solves}}{\text{Total Tries}} \times 100\%$.
- **Word Tries Breakdown Modal:** An interactive pop-out modal accessible from the round summary showing:
  - Word index and answer in uppercase.
  - Difficulty badge.
  - Number of tries taken with a star (⭐) for first-try solves.
  - Status tag (`✓ Solved`, `⤼ Skipped`, or `⏱ Time Up`).
  - Summary stats: Total Words, Total Tries, Average Tries per Word, and Accuracy %.

---

### 💡 Hints System & Controls
- **Category Hint:** Displays part of speech and semantic topic (e.g., `Noun • Animals & Wildlife`).
- **Definition Hint:** Displays authentic dictionary definition.
- **1st Letter Hint:** Reveals the starting letter of the target word.
- **Quit / Pause Modal:** Safely pauses active countdown clocks when confirming to quit a run.
- **Keyboard & Touch Accessibility:** Wordle-style letter boxes with arrow-key navigation, automatic advancing, paste support, and global typing listeners.

---

## 🛠️ Project Structure

```
Jumble-Word-Game-main/
├── client/                     # Frontend (React + Vite)
│   ├── src/
│   │   ├── App.jsx             # Main game logic, state, and UI components
│   │   ├── index.css           # Responsive styles, themes, animations, modals
│   │   └── main.jsx            # React root entry point
│   ├── index.html              # HTML shell
│   ├── package.json            # Client dependencies & scripts
│   └── vite.config.js          # Vite build configuration & API proxy
├── server/                     # Backend (Node.js + Express)
│   ├── index.js                # Express API server & routes
│   ├── words.js                # Dictionary API client, caching & jumble engine
│   └── package.json            # Server dependencies & scripts
├── package.json                # Root package for workspace orchestration
└── README.md                   # Project documentation
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** (v18 or higher recommended)
- **npm** (v8 or higher)

### Installation
From the root directory, install all dependencies for both client and server:
```bash
npm run install:all
```
*(Or manually run `npm install` in both `client/` and `server/`)*

---

### Running the Application

To run both backend server and frontend client concurrently:
```bash
npm run dev
```

Or run them individually:
1. **Start the Express API server:**
   ```bash
   npm run server
   ```
   *Runs at `http://localhost:5001`*

2. **Start the Vite frontend development server:**
   ```bash
   npm run client
   ```
   *Runs at `http://localhost:5173` with proxying to port 5001*

---

### Production Build
To create an optimized production build of the frontend:
```bash
npm run build:client
```
The Express backend is configured to automatically serve the static build files from `client/dist` when accessed directly at `http://localhost:5001`.

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Health-check endpoint returning server status and timestamp. |
| `GET` | `/api/words/random?difficulty=easy\|medium\|hard\|random` | Retrieves a dynamic jumbled word from the Dictionary API pool. |
| `POST` | `/api/words/check` | Validates a player's submitted answer (`{ id, answer }`). |
| `POST` | `/api/words/hint` | Retrieves a hint (`category`, `definition`, or `first-letter`) for a word by ID. |
| `POST` | `/api/words/reveal` | Reveals the correct answer for a word by ID upon timeout or skip. |
| `GET` | `/api/words/stats` | Returns total words overview. |

---

## 📜 Technical Highlights & Architecture

- **Dictionary API Pipeline:** Combines **Datamuse API** (for frequency-scored, topic-categorized vocabulary queries) with the **Free Dictionary API** (for Wiktionary definition enrichment).
- **Graceful Fallback:** Includes a 50+ word seed dictionary ensuring instant cold start ($<5\text{ ms}$) and uninterrupted gameplay even during network dropouts or offline environments.
- **Oxlint & Vite Validated:** Fast, error-free builds and modern ES module imports.
- **Responsive Design:** Optimized for both mobile devices and desktop screens.
