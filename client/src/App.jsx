import { useState, useRef, useEffect, useCallback } from 'react';

const MODE_CONFIG = {
  casual: { label: '🧘 Casual', duration: null },
  speed: { label: '⚡ Speed (20s)', duration: 20 },
  blitz: { label: '⏱️ Blitz (10s)', duration: 10 },
  hardcore: { label: '💀 Hardcore (15s)', duration: 15, isHardcore: true }
};

const DIFFICULTY_CONFIG = {
  easy: { label: '🟢 Easy', desc: '5-6 letters', basePoints: 10, badgeClass: 'easy' },
  medium: { label: '🟡 Medium', desc: '7-8 letters', basePoints: 12, badgeClass: 'medium' },
  hard: { label: '🔴 Hard', desc: '9+ letters', basePoints: 15, badgeClass: 'hard' }
};

function App() {
  const [gameStarted, setGameStarted] = useState(false);
  const [currentWord, setCurrentWord] = useState(null);
  const [userInput, setUserInput] = useState('');
  const [isWrong, setIsWrong] = useState(false);
  const [loading, setLoading] = useState(false);

  // Difficulty: 'easy' | 'medium' | 'hard'
  const [difficulty, setDifficulty] = useState('medium');

  // Hints State: category, definition, first-letter for current word
  const [hints, setHints] = useState({
    category: null,
    definition: null,
    'first-letter': null
  });
  const [loadingHint, setLoadingHint] = useState(null);

  // Game Mode: 'casual' | 'speed' | 'blitz' | 'hardcore'
  const [mode, setMode] = useState('speed');

  // Hardcore Mode Session Limits: 3 skips total & 1 of each hint total
  const [hardcoreSkipsLeft, setHardcoreSkipsLeft] = useState(3);
  const [hardcoreHintsLeft, setHardcoreHintsLeft] = useState({
    category: 1,
    definition: 1,
    'first-letter': 1
  });

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

  // Non-blocking quick feedback
  const [successToast, setSuccessToast] = useState(null);
  const [isInputFlashing, setIsInputFlashing] = useState(false);
  const [streakBrokenNotice, setStreakBrokenNotice] = useState(false);

  // Quit confirmation & clock pause state
  const [showQuitModal, setShowQuitModal] = useState(false);

  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const endTimeRef = useRef(null);
  const pausedRemainingMsRef = useRef(null);
  const toastTimeoutRef = useRef(null);

  // User is locked in the mode and difficulty while a game is actively running
  const isLocked = gameStarted && !isTimeUp;

  // Fetch word reveal when time runs out (Loss in timed mode)
  const handleTimeUp = useCallback(async (wordId) => {
    setIsTimeUp(true);
    setIsWrong(false);
    endTimeRef.current = null;
    pausedRemainingMsRef.current = null;

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

  // Fetch a new jumbled word from Express backend by difficulty
  const fetchNewWord = useCallback(
    async (activeMode = mode, activeDifficulty = difficulty) => {
      setLoading(true);
      setIsWrong(false);
      setIsTimeUp(false);
      setRevealedAnswer(null);
      setUserInput('');
      setHints({ category: null, definition: null, 'first-letter': null });
      setLoadingHint(null);

      // Initialize countdown timer with precision timestamp
      const duration = MODE_CONFIG[activeMode].duration;
      if (duration) {
        endTimeRef.current = Date.now() + duration * 1000;
        pausedRemainingMsRef.current = null;
        setTimeLeft(duration);
      } else {
        endTimeRef.current = null;
        pausedRemainingMsRef.current = null;
        setTimeLeft(null);
      }

      try {
        const res = await fetch(`/api/words/random?difficulty=${activeDifficulty}`);
        if (!res.ok) throw new Error('Failed to load word');
        const data = await res.json();
        setCurrentWord(data);
      } catch (err) {
        console.error('Error fetching random word:', err);
      } finally {
        setLoading(false);
      }
    },
    [mode, difficulty]
  );

  // Request a specific hint from server
  const handleGetHint = async (type) => {
    if (!currentWord || hints[type] || loadingHint || showQuitModal) return;

    // In hardcore mode, check remaining hint inventory
    if (mode === 'hardcore' && hardcoreHintsLeft[type] <= 0) {
      return;
    }

    setLoadingHint(type);
    try {
      const res = await fetch('/api/words/hint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentWord.id,
          type
        })
      });
      if (res.ok) {
        const data = await res.json();
        setHints((prev) => ({
          ...prev,
          [type]: data.hint
        }));

        // Deduct 1 hint from Hardcore inventory
        if (mode === 'hardcore') {
          setHardcoreHintsLeft((prev) => ({
            ...prev,
            [type]: Math.max(0, prev[type] - 1)
          }));
        }
      }
    } catch (err) {
      console.error('Error fetching hint:', err);
    } finally {
      setLoadingHint(null);
    }
  };

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
      isTimeUp ||
      !currentWord ||
      !endTimeRef.current ||
      showQuitModal
    ) {
      return;
    }

    const checkTimer = () => {
      if (!endTimeRef.current || showQuitModal) return;
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
  }, [mode, gameStarted, loading, isTimeUp, currentWord, showQuitModal, handleTimeUp]);

  // Start the game on clicking "Play"
  const handleStartGame = async () => {
    if (mode === 'hardcore') {
      setHardcoreSkipsLeft(3);
      setHardcoreHintsLeft({
        category: 1,
        definition: 1,
        'first-letter': 1
      });
      setScore(0);
      setStreak(0);
    }
    setGameStarted(true);
    setStreakBrokenNotice(false);
    setSuccessToast(null);
    await fetchNewWord();
  };

  // Restart hardcore run from Game Over
  const handleRestartHardcore = async () => {
    setHardcoreSkipsLeft(3);
    setHardcoreHintsLeft({
      category: 1,
      definition: 1,
      'first-letter': 1
    });
    setScore(0);
    setStreak(0);
    setStreakBrokenNotice(false);
    setSuccessToast(null);
    await fetchNewWord();
  };

  // Focus input when a new word is displayed or user plays again
  useEffect(() => {
    if (gameStarted && !isTimeUp && !showQuitModal && inputRef.current) {
      inputRef.current.focus();
    }
  }, [currentWord, gameStarted, isTimeUp, showQuitModal]);

  // Handle checking submitted answer
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!currentWord || !userInput.trim() || loading || isTimeUp || showQuitModal) return;

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
        setIsWrong(false);
        setStreakBrokenNotice(false);

        // Flash input border green for quick delightful feedback
        setIsInputFlashing(true);
        setTimeout(() => setIsInputFlashing(false), 300);

        // Calculate score & streak
        const newStreak = streak + 1;
        setStreak(newStreak);

        // Base points based on difficulty (Easy: 10, Medium: 12, Hard: 15)
        const basePts = DIFFICULTY_CONFIG[difficulty]?.basePoints || 10;
        const streakBonus = (newStreak - 1) * 2;
        let pointsEarned = basePts + streakBonus;

        // In Hardcore mode, bonus multiplier for high stakes!
        if (mode === 'hardcore') {
          pointsEarned += 5; // Hardcore challenge bonus
        }

        // Speed bonus if solved with half or more time remaining
        const maxTime = MODE_CONFIG[mode].duration;
        let hasSpeedBonus = false;
        if (maxTime && timeLeft >= Math.floor(maxTime / 2)) {
          pointsEarned += 5;
          hasSpeedBonus = true;
        }

        const newScore = score + pointsEarned;
        setScore(newScore);

        // Show non-blocking floating toast
        if (toastTimeoutRef.current) {
          clearTimeout(toastTimeoutRef.current);
        }
        setSuccessToast({
          points: pointsEarned,
          streak: newStreak,
          speedBonus: hasSpeedBonus
        });
        toastTimeoutRef.current = setTimeout(() => {
          setSuccessToast(null);
        }, 1800);

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

        // Seamless continuous flow: immediately load next word without stopping for a popup!
        fetchNewWord();
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

  // Handle Skip Word
  const handleSkipWord = () => {
    if (showQuitModal) return;

    if (mode === 'hardcore') {
      if (hardcoreSkipsLeft <= 0) return;
      setHardcoreSkipsLeft((prev) => prev - 1);
    }

    if (!isTimeUp && streak > 0) {
      setStreak(0);
      setStreakBrokenNotice(true);
      setTimeout(() => setStreakBrokenNotice(false), 3000);
    } else {
      setStreakBrokenNotice(false);
    }

    fetchNewWord();
  };

  // Request to quit mode: pauses the clock and displays confirmation popout
  const handleRequestQuit = () => {
    // Pause the clock
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    if (endTimeRef.current) {
      const remainingMs = Math.max(0, endTimeRef.current - Date.now());
      pausedRemainingMsRef.current = remainingMs;
      setTimeLeft(Math.max(0, Math.ceil(remainingMs / 1000)));
    }

    setShowQuitModal(true);
  };

  // Cancel quit: resumes the clock exactly where it paused
  const handleCancelQuit = () => {
    setShowQuitModal(false);

    if (pausedRemainingMsRef.current && MODE_CONFIG[mode].duration) {
      endTimeRef.current = Date.now() + pausedRemainingMsRef.current;
      pausedRemainingMsRef.current = null;
    }
  };

  // Confirmed quit: exits mode and unlocks selector
  const handleConfirmQuit = () => {
    setShowQuitModal(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    endTimeRef.current = null;
    pausedRemainingMsRef.current = null;

    if (streak > 0) {
      setStreak(0);
    }

    setGameStarted(false);
    setIsWrong(false);
    setIsTimeUp(false);
    setRevealedAnswer(null);
    setCurrentWord(null);
    setUserInput('');
    setHints({ category: null, definition: null, 'first-letter': null });
    setSuccessToast(null);
    setStreakBrokenNotice(false);
    setTimeLeft(MODE_CONFIG[mode].duration);
  };

  // Switch game mode (Only allowed when not locked in active gameplay)
  const handleModeChange = (newMode) => {
    if (isLocked || newMode === mode) return;
    setMode(newMode);
    setTimeLeft(MODE_CONFIG[newMode].duration);
  };

  // Switch difficulty level (Only allowed when not locked in active gameplay)
  const handleDifficultyChange = (newDiff) => {
    if (isLocked || newDiff === difficulty) return;
    setDifficulty(newDiff);
  };

  // Handle escape key to resume from modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && showQuitModal) {
        handleCancelQuit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showQuitModal]);

  // Timer color severity
  const maxDuration = MODE_CONFIG[mode].duration;
  const timerPercentage = maxDuration ? Math.max(0, (timeLeft / maxDuration) * 100) : 100;
  const isWarning = maxDuration && timeLeft <= Math.ceil(maxDuration * 0.45) && timeLeft > 4;
  const isCritical = maxDuration && timeLeft <= 4;

  const timerStatusClass = showQuitModal
    ? 'paused'
    : isCritical
    ? 'critical'
    : isWarning
    ? 'warning'
    : '';

  return (
    <main>
      <h1>Jumbled Word Generator</h1>

      {/* Mode & Difficulty Settings Bar */}
      <div className="settings-bar">
        <div className="selectors-row">
          {/* Mode Selector */}
          <div className="selector-group">
            <span className="selector-label">Game Mode</span>
            <nav
              className={`mode-selector ${isLocked ? 'locked' : ''}`}
              aria-label="Game Mode"
            >
              {Object.entries(MODE_CONFIG).map(([key, config]) => (
                <button
                  key={key}
                  type="button"
                  className={`mode-btn ${key} ${mode === key ? 'active' : ''}`}
                  disabled={isLocked && mode !== key}
                  onClick={() => handleModeChange(key)}
                  title={isLocked ? 'Settings locked during active game' : ''}
                >
                  {config.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Difficulty Selector */}
          <div className="selector-group">
            <span className="selector-label">Difficulty</span>
            <nav
              className={`difficulty-selector ${isLocked ? 'locked' : ''}`}
              aria-label="Difficulty Level"
            >
              {Object.entries(DIFFICULTY_CONFIG).map(([key, config]) => (
                <button
                  key={key}
                  type="button"
                  className={`difficulty-btn ${key} ${difficulty === key ? 'active' : ''}`}
                  disabled={isLocked && difficulty !== key}
                  onClick={() => handleDifficultyChange(key)}
                  title={isLocked ? 'Settings locked during active game' : ''}
                >
                  {config.label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {isLocked && (
          <span className="mode-lock-hint">
            🔒 Settings locked • Finish round or Quit to change
          </span>
        )}
      </div>

      {/* Hardcore Mode Status Bar / Inventory */}
      {mode === 'hardcore' && (
        <section className="hardcore-hud" aria-label="Hardcore inventory">
          <div className="hardcore-hud-title">
            <span>💀 Hardcore Rules</span>
          </div>
          <div className="hardcore-badges">
            <span
              className={`hardcore-pill ${hardcoreSkipsLeft > 0 ? 'active' : 'empty'}`}
            >
              ⏭️ Skips: {hardcoreSkipsLeft}/3
            </span>
            <span
              className={`hardcore-pill ${hardcoreHintsLeft.category > 0 ? 'active' : 'empty'}`}
            >
              🏷️ Category: {hardcoreHintsLeft.category}/1
            </span>
            <span
              className={`hardcore-pill ${hardcoreHintsLeft.definition > 0 ? 'active' : 'empty'}`}
            >
              📖 Definition: {hardcoreHintsLeft.definition}/1
            </span>
            <span
              className={`hardcore-pill ${hardcoreHintsLeft['first-letter'] > 0 ? 'active' : 'empty'}`}
            >
              🔤 1st Letter: {hardcoreHintsLeft['first-letter']}/1
            </span>
          </div>
        </section>
      )}

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
          Play {DIFFICULTY_CONFIG[difficulty]?.label}
        </button>
      )}

      {gameStarted && (
        <article className="result">
          {/* Active Countdown Timer */}
          {maxDuration && !loading && !isTimeUp && (
            <div className="timer-container">
              <div className="timer-header">
                <span>Time Remaining</span>
                <span className={`timer-badge ${timerStatusClass}`}>
                  {showQuitModal ? '⏸️ Paused' : `⏱️ ${timeLeft}s`}
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

          {/* Non-intrusive Quick Success Toast */}
          <div className="toast-container" aria-live="polite">
            {successToast && (
              <div className="success-toast">
                <span>✨ Correct! +{successToast.points} pts</span>
                {successToast.streak > 1 && (
                  <span>(🔥 Streak x{successToast.streak})</span>
                )}
                {successToast.speedBonus && <span>(⚡ Speed Bonus!)</span>}
              </div>
            )}
          </div>

          {loading && <p className="loading">Loading next word...</p>}

          {/* Time's Up State (Lost / Ended) */}
          {!loading && isTimeUp && (
            <>
              <p className="outcome time-up">
                {mode === 'hardcore' ? 'Game Over 💀' : "Time's Up! ⏰"}
              </p>
              {revealedAnswer && (
                <p className="revealed-answer">
                  The correct word was: <strong>{revealedAnswer}</strong>
                </p>
              )}
              {mode === 'hardcore' && (
                <p className="hardcore-summary">
                  Final Score: {score} • Streak: {streak}
                </p>
              )}
              <div className="button-group">
                <button
                  id="again-btn"
                  onClick={
                    mode === 'hardcore'
                      ? handleRestartHardcore
                      : () => fetchNewWord()
                  }
                >
                  {mode === 'hardcore' ? 'Try Hardcore Again' : 'Try Next Word'}
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={handleConfirmQuit}
                >
                  Exit Mode
                </button>
              </div>
            </>
          )}

          {/* Active Guessing State (Continuous Flow) */}
          {!loading && !isTimeUp && currentWord && (
            <>
              <div>
                <span
                  className={`difficulty-tag ${DIFFICULTY_CONFIG[currentWord.difficulty || difficulty]?.badgeClass}`}
                >
                  {DIFFICULTY_CONFIG[currentWord.difficulty || difficulty]?.label}
                </span>
              </div>

              <p className="outcome">{currentWord.jumbled}</p>

              {/* Hints System */}
              <div className="hints-panel">
                <div className="hints-header">
                  <span>
                    💡 Hints {mode === 'hardcore' ? '(1 of each for entire run)' : ''}
                  </span>
                </div>
                <div className="hint-buttons-group">
                  <button
                    type="button"
                    className={`hint-btn ${hints.category ? 'revealed' : ''}`}
                    onClick={() => handleGetHint('category')}
                    disabled={
                      Boolean(hints.category) ||
                      (mode === 'hardcore' && hardcoreHintsLeft.category <= 0) ||
                      loadingHint === 'category' ||
                      showQuitModal
                    }
                  >
                    🏷️{' '}
                    {hints.category
                      ? 'Category (Active)'
                      : mode === 'hardcore'
                      ? `Category (${hardcoreHintsLeft.category} left)`
                      : loadingHint === 'category'
                      ? 'Loading...'
                      : 'Category'}
                  </button>
                  <button
                    type="button"
                    className={`hint-btn ${hints.definition ? 'revealed' : ''}`}
                    onClick={() => handleGetHint('definition')}
                    disabled={
                      Boolean(hints.definition) ||
                      (mode === 'hardcore' && hardcoreHintsLeft.definition <= 0) ||
                      loadingHint === 'definition' ||
                      showQuitModal
                    }
                  >
                    📖{' '}
                    {hints.definition
                      ? 'Definition (Active)'
                      : mode === 'hardcore'
                      ? `Definition (${hardcoreHintsLeft.definition} left)`
                      : loadingHint === 'definition'
                      ? 'Loading...'
                      : 'Definition'}
                  </button>
                  <button
                    type="button"
                    className={`hint-btn ${hints['first-letter'] ? 'revealed' : ''}`}
                    onClick={() => handleGetHint('first-letter')}
                    disabled={
                      Boolean(hints['first-letter']) ||
                      (mode === 'hardcore' && hardcoreHintsLeft['first-letter'] <= 0) ||
                      loadingHint === 'first-letter' ||
                      showQuitModal
                    }
                  >
                    🔤{' '}
                    {hints['first-letter']
                      ? '1st Letter (Active)'
                      : mode === 'hardcore'
                      ? `1st Letter (${hardcoreHintsLeft['first-letter']} left)`
                      : loadingHint === 'first-letter'
                      ? 'Loading...'
                      : 'Reveal 1st Letter'}
                  </button>
                </div>

                {(hints.category || hints.definition || hints['first-letter']) && (
                  <div className="hint-cards">
                    {hints.category && (
                      <div className="hint-card category">
                        <span className="hint-card-label">🏷️ Category:</span>
                        <span className="hint-card-content">{hints.category}</span>
                      </div>
                    )}
                    {hints.definition && (
                      <div className="hint-card definition">
                        <span className="hint-card-label">📖 Definition:</span>
                        <span className="hint-card-content">{hints.definition}</span>
                      </div>
                    )}
                    {hints['first-letter'] && (
                      <div className="hint-card first-letter">
                        <span className="hint-card-label">🔤 First Letter:</span>
                        <span className="hint-card-content">
                          Starts with <strong>{hints['first-letter']}</strong>...
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <form onSubmit={handleSubmit}>
                <div>
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="Enter answer"
                    id="input"
                    className={isInputFlashing ? 'flash-correct' : ''}
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    autoComplete="off"
                    disabled={showQuitModal}
                  />
                </div>
                <div className="button-group">
                  <button type="submit" id="submit-btn" disabled={showQuitModal}>
                    Submit
                  </button>
                  <button
                    type="button"
                    id="again-btn"
                    className="secondary-btn"
                    onClick={handleSkipWord}
                    disabled={
                      showQuitModal ||
                      (mode === 'hardcore' && hardcoreSkipsLeft <= 0)
                    }
                  >
                    {mode === 'hardcore'
                      ? hardcoreSkipsLeft > 0
                        ? `Skip (${hardcoreSkipsLeft} left)`
                        : 'No Skips Left'
                      : 'Skip Word'}
                  </button>
                  <button
                    type="button"
                    className="danger-btn"
                    onClick={handleRequestQuit}
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

      {/* Confirmation Modal Popout with Clock Pausing */}
      {showQuitModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-box">
            <span className="modal-paused-tag">⏸️ Clock Paused</span>
            <h2 className="modal-title">Quit Current Mode?</h2>
            <p className="modal-message">
              {streak > 0
                ? `Are you sure you want to quit? Your active streak of 🔥 ${streak} will be reset.`
                : 'Are you sure you want to quit and return to mode selection?'}
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="modal-resume-btn"
                onClick={handleCancelQuit}
                autoFocus
              >
                Resume Game
              </button>
              <button
                type="button"
                className="secondary-btn modal-quit-btn"
                onClick={handleConfirmQuit}
              >
                Quit Mode
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
