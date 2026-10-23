import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { getRandomWord, checkAnswer, getWordAnswer, getWordHint, WORDS } from './words.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// API: Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API: Get a random jumbled word (with optional difficulty: easy | medium | hard)
app.get('/api/words/random', (req, res) => {
  const { difficulty } = req.query;
  const word = getRandomWord(difficulty);
  res.json(word);
});

// API: Check submitted answer
app.post('/api/words/check', (req, res) => {
  const { id, answer } = req.body;

  if (id === undefined || answer === undefined) {
    return res.status(400).json({ error: 'Missing word id or answer' });
  }

  const result = checkAnswer(id, answer);
  if (!result.found) {
    return res.status(404).json({ error: 'Word not found' });
  }

  res.json({
    correct: result.correct,
    message: result.correct ? 'Correct!' : 'Wrong! Try again'
  });
});

// API: Reveal word answer (e.g. When time expires or player gives up)
app.post('/api/words/reveal', (req, res) => {
  const { id } = req.body;
  if (id === undefined) {
    return res.status(400).json({ error: 'Missing word id' });
  }

  const answer = getWordAnswer(id);
  if (!answer) {
    return res.status(404).json({ error: 'Word not found' });
  }

  res.json({ answer });
});

// API: Get hint for a word (category, definition, or first-letter)
app.post('/api/words/hint', (req, res) => {
  const { id, type } = req.body;
  if (id === undefined || !type) {
    return res.status(400).json({ error: 'Missing word id or hint type' });
  }

  const hintResult = getWordHint(id, type);
  if (!hintResult) {
    return res.status(404).json({ error: 'Hint not found for word' });
  }

  res.json(hintResult);
});

// API: Get total words count / list overview (for future expansions)
app.get('/api/words/stats', (req, res) => {
  res.json({ totalWords: WORDS.length });
});

// Serve static frontend files when built
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDistPath));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(clientDistPath, 'index.html'), (err) => {
    if (err) {
      // If client is not yet built, just return simple message
      res.status(200).send('Jumble Word Game Backend running. Run Vite dev server for frontend.');
    }
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Jumble Word Server listening on port ${PORT}`);
});
