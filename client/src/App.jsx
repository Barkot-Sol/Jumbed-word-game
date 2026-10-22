import { useState, useRef, useEffect, useCallback } from 'react';

const MODE_CONFIG = {
  casual: { label: '🧘 Casual', duration: null },
  speed: { label: '⚡ Speed (20s)', duration: 20 },
  blitz: { label: '⏱️ Blitz (10s)', duration: 10 }
};

function App() {
  const [gameStarted, setGameStarted] = useState(false);
  const [currentWord, setCurrentWord] = useState(null);
  const [userInput, setUserInput] = useState('');
  const [isCorrect, setIsCorrect] = useState(false);
  const [isWrong, setIsWrong] = useState(false);
  const [loading, setLoading] = useState(false);

  // Game Mode: 'casual' | 'speed' | 'blitz'
  const [mode, setMode] = useState('speed');

  // Countdown Timer
  const [timeLeft, setTimeLeft] = useState(MODE_CONFIG.speed.duration);
  const [isTimeUp, setIsTimeUp] = useState(false);
  const [revealedAnswer, setRevealedAnswer] = useState(null);

  // Score & Streak tracking
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    return parseInt(localStorage.getItem('jumble_high_score') || '0', 10);
  });
  const [bestStreak, setBestStreak] = useState(() => {
    return parseInt(localStorage.getItem('jumble_best_streak') || '0', 10);
  });
  const [lastEarnedPoints, setLastEarnedPoints] = useState(0);
  const [speedBonusAwarded, setSpeedBonusAwarded] = useState(false);
  const [streakBrokenNotice, setStreakBrokenNotice] = useState(false);

  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const endTimeRef = useRef(null);

  // User is locked in the mode while a game is actively running
  const isModeLocked = gameStarted && !isTimeUp;

  // Fetch word reveal when time runs out (Loss in timed mode)
  const handleTimeUp = useCallback(async (wordId) => {
    setIsTimeUp(true);
    setIsWrong(false);
    endTimeRef.current = null;

    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    // Break active streak
    setStreak((prev) => {
      if (prev > 0) {
        setStreakBrokenNotice(true);
        setTimeout(() => setStreakBrokenNotice(false), 3000);
      }
      return 0;
    });

    try {
      const res = await fetch('/api/words/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: wordId })
      });
      if (res.ok) {
        const data = await res.json();
        setRevealedAnswer(data.answer);
      }
    } catch (err) {
      console.error('Error revealing answer:', err);
    }
  }, []);

  // Fetch a new jumbled word from Express backend
  const fetchNewWord = useCallback(async (activeMode = mode) => {
    setLoading(true);
    setIsWrong(false);
    setIsCorrect(false);
    setIsTimeUp(false);
    setRevealedAnswer(null);
    setUserInput('');
    setSpeedBonusAwarded(false);

    // Initialize countdown timer with precision timestamp
    const duration = MODE_CONFIG[activeMode].duration;
    if (duration) {
      endTimeRef.current = Date.now() + duration * 1000;
      setTimeLeft(duration);
    } else {
      endTimeRef.current = null;
      setTimeLeft(null);
    }

    try {
      const res = await fetch('/api/words/random');
      if (!res.ok) throw new Error('Failed to load word');
      const data = await res.json();
      setCurrentWord(data);
    } catch (err) {
      console.error('Error fetching random word:', err);
    } finally {
      setLoading(false);
    }
  }, [mode]);

  // Precision countdown timer interval
  useEffect(() => {
    const duration = MODE_CONFIG[mode].duration;

    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    if (
      !duration ||
      !gameStarted ||
      loading ||
      isCorrect ||
      isTimeUp ||
      !currentWord ||
      !endTimeRef.current
    ) {
      return;
    }

    const checkTimer = () => {
      if (!endTimeRef.current) return;
      const remainingMs = endTimeRef.current - Date.now();
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
      setTimeLeft(remainingSec);

      if (remainingSec <= 0) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
        handleTimeUp(currentWord.id);
      }
    };

    // Check timer every 200ms to guarantee zero lag or drifting
    timerRef.current = setInterval(checkTimer, 200);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [mode, gameStarted, loading, isCorrect, isTimeUp, currentWord, handleTimeUp]);

  // Start the game on clicking "Play"
  const handleStartGame = async () => {
    setGameStarted(true);
    setStreakBrokenNotice(false);
    await fetchNewWord();
  };

  // Focus input when a new word is displayed or user plays again
  useEffect(() => {
    if (gameStarted && !isCorrect && !isTimeUp && inputRef.current) {
      inputRef.current.focus();
    }
  }, [currentWord, gameStarted, isCorrect, isTimeUp]);

  // Handle checking submitted answer
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!currentWord || !userInput.trim() || loading || isTimeUp) return;

    try {
      const res = await fetch('/api/words/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentWord.id,
          answer: userInput
        })
      });

      const data = await res.json();

      if (data.correct) {
        // Stop the timer immediately
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
        endTimeRef.current = null;

        setIsCorrect(true);
        setIsWrong(false);
        setStreakBrokenNotice(false);

        // Calculate score & streak
        const newStreak = streak + 1;
        setStreak(newStreak);

        // Base + Streak bonus (2 extra pts per streak level)
        const streakBonus = (newStreak - 1) * 2;
        let pointsEarned = 10 + streakBonus;

        // Speed bonus if solved with half or more time remaining
        const maxTime = MODE_CONFIG[mode].duration;
        let hasSpeedBonus = false;
        if (maxTime && timeLeft >= Math.floor(maxTime / 2)) {
          pointsEarned += 5;
          hasSpeedBonus = true;
        }

        setSpeedBonusAwarded(hasSpeedBonus);
        setLastEarnedPoints(pointsEarned);

        const newScore = score + pointsEarned;
        setScore(newScore);

        // Update high score
        if (newScore > highScore) {
          setHighScore(newScore);
          localStorage.setItem('jumble_high_score', newScore.toString());
        }

        // Update best streak
        if (newStreak > bestStreak) {
          setBestStreak(newStreak);
          localStorage.setItem('jumble_best_streak', newStreak.toString());
        }
      } else {
        setIsWrong(true);
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }
    } catch (err) {
      console.error('Error checking answer:', err);
    }
  };

  // Handle Play Again (or skip to next word)
  const handlePlayAgain = () => {
    if (!isCorrect && !isTimeUp && streak > 0) {
      setStreak(0);
      setStreakBrokenNotice(true);
      setTimeout(() => setStreakBrokenNotice(false), 3000);
    } else {
      setStreakBrokenNotice(false);
    }

    fetchNewWord();
  };

  // Quit / Exit current mode and return to mode selection
  const handleQuitGame = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    endTimeRef.current = null;

    if (streak > 0) {
      setStreak(0);
    }

    setGameStarted(false);
    setIsCorrect(false);
    setIsWrong(false);
    setIsTimeUp(false);
    setRevealedAnswer(null);
    setCurrentWord(null);
    setUserInput('');
    setStreakBrokenNotice(false);
    setTimeLeft(MODE_CONFIG[mode].duration);
  };

  // Switch game mode (Only allowed when not in an active locked game)
  const handleModeChange = (newMode) => {
    if (isModeLocked || newMode === mode) return;
    setMode(newMode);
    setTimeLeft(MODE_CONFIG[newMode].duration);
  };

  // Reset all stats (Score, High Score, Streaks)
  const handleResetStats = () => {
    if (window.confirm('Reset all scores and streaks?')) {
      setScore(0);
      setStreak(0);
      setHighScore(0);
      setBestStreak(0);
      localStorage.removeItem('jumble_high_score');
      localStorage.removeItem('jumble_best_streak');
    }
  };

  // Timer color severity
  const maxDuration = MODE_CONFIG[mode].duration;
  const timerPercentage = maxDuration ? Math.max(0, (timeLeft / maxDuration) * 100) : 100;
  const isWarning = maxDuration && timeLeft <= Math.ceil(maxDuration * 0.45) && timeLeft > 4;
  const isCritical = maxDuration && timeLeft <= 4;

  const timerStatusClass = isCritical ? 'critical' : isWarning ? 'warning' : '';

  return (
    <main>
      <h1>Jumbled Word Generator</h1>

      {/* Mode Switcher with Lock state */}
      <div className="mode-selector-wrapper">
        <nav
          className={`mode-selector ${isModeLocked ? 'locked' : ''}`}
          aria-label="Game Mode"
        >
          {Object.entries(MODE_CONFIG).map(([key, config]) => (
            <button
              key={key}
              type="button"
              className={`mode-btn ${mode === key ? 'active' : ''}`}
              disabled={isModeLocked && mode !== key}
              onClick={() => handleModeChange(key)}
              title={isModeLocked ? 'Mode locked during active game' : ''}
            >
              {config.label}
            </button>
          ))}
        </nav>
        {isModeLocked && (
          <span className="mode-lock-hint">
            🔒 Mode locked • Finish round or Quit to change
          </span>
        )}
      </div>

      {/* Score and Streak Dashboard */}
      <section className="scoreboard" aria-label="Scoreboard">
        <div className="stat-card">
          <span className="stat-label">Score</span>
          <span className="stat-value score">{score}</span>
        </div>
        <div className={`stat-card ${streak > 0 ? 'streak-active' : ''}`}>
          <span className="stat-label">Streak</span>
          <span className="stat-value streak">
            {streak > 0 ? `🔥 ${streak}` : '0'}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Best Streak</span>
          <span className="stat-value best">🏆 {bestStreak}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">High Score</span>
          <span className="stat-value">⭐ {highScore}</span>
        </div>
      </section>

      {!gameStarted && (
        <button id="start-btn" onClick={handleStartGame}>
          Play
        </button>
      )}

      {gameStarted && (
        <article className="result">
          {/* Active Countdown Timer */}
          {maxDuration && !loading && !isCorrect && !isTimeUp && (
            <div className="timer-container">
              <div className="timer-header">
                <span>Time Remaining</span>
                <span className={`timer-badge ${timerStatusClass}`}>
                  ⏱️ {timeLeft}s
                </span>
              </div>
              <div className="timer-bar-track">
                <div
                  className={`timer-bar-fill ${timerStatusClass}`}
                  style={{ width: `${timerPercentage}%` }}
                />
              </div>
            </div>
          )}

          {loading && <p className="loading">Loading next word...</p>}

          {/* Time's Up State (Lost / Ended) */}
          {!loading && isTimeUp && (
            <>
              <p className="outcome time-up">Time's Up! ⏰</p>
              {revealedAnswer && (
                <p className="revealed-answer">
                  The correct word was: <strong>{revealedAnswer}</strong>
                </p>
              )}
              <div className="button-group">
                <button id="again-btn" onClick={handlePlayAgain}>
                  Try Next Word
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={handleQuitGame}
                >
                  Exit Mode
                </button>
              </div>
            </>
          )}

          {/* Correct State */}
          {!loading && isCorrect && (
            <>
              <p className="outcome">Correct!</p>
              <div>
                <span className="points-badge">
                  +{lastEarnedPoints} pts
                  {streak > 1 ? ` (Streak x${streak})` : ''}
                  {speedBonusAwarded ? ' (⚡ Speed Bonus!)' : ''}
                </span>
              </div>
              <div className="button-group">
                <button id="again-btn" onClick={handlePlayAgain}>
                  Next Word
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={handleQuitGame}
                >
                  Exit Mode
                </button>
              </div>
            </>
          )}

          {/* Guessing State */}
          {!loading && !isCorrect && !isTimeUp && currentWord && (
            <>
              <p className="outcome">{currentWord.jumbled}</p>
              <form onSubmit={handleSubmit}>
                <div>
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="Enter answer"
                    id="input"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="button-group">
                  <button type="submit" id="submit-btn">
                    Submit
                  </button>
                  <button
                    type="button"
                    id="again-btn"
                    className="secondary-btn"
                    onClick={handlePlayAgain}
                  >
                    Skip Word
                  </button>
                  <button
                    type="button"
                    className="danger-btn"
                    onClick={handleQuitGame}
                  >
                    Quit Mode
                  </button>
                </div>
              </form>
              {isWrong && <p className="error">Wrong! Try again</p>}
              {streakBrokenNotice && (
                <p className="streak-notice">Streak reset to 0!</p>
              )}
            </>
          )}
        </article>
      )}

      {/* Option to reset stats */}
      {(score > 0 || highScore > 0 || bestStreak > 0) && (
        <div className="stats-actions">
          <button
            type="button"
            className="reset-stats-btn"
            onClick={handleResetStats}
          >
            Reset All Stats
          </button>
        </div>
      )}
    </main>
  );
}

export default App;
