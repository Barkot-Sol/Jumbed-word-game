import { useState, useRef, useEffect, useCallback } from 'react';

const MODE_CONFIG = {
  speed: { label: '⚡ Speed (20s)', duration: 20 },
  blitz: { label: '⏱️ Blitz (10s)', duration: 10 },
  casual: { label: '🧘 Casual', duration: null },
  endless: { label: '♾️ Endless', duration: null, isEndless: true },
  hardcore: { label: '💀 Hardcore (15s)', duration: 15, isHardcore: true }
};

const DIFFICULTY_CONFIG = {
  easy: { label: '🟢 Easy', desc: '5-6 letters', basePoints: 10, badgeClass: 'easy' },
  medium: { label: '🟡 Medium', desc: '7-8 letters', basePoints: 12, badgeClass: 'medium' },
  hard: { label: '🔴 Hard', desc: '9+ letters', basePoints: 15, badgeClass: 'hard' },
  random: { label: '🎲 Random', desc: 'Mixed', basePoints: 12, badgeClass: 'random' }
};

const WORD_COUNT_OPTIONS = [
  { id: '10', label: '10 (Default)', count: 10 },
  { id: '15', label: '15', count: 15 },
  { id: '20', label: '20', count: 20 },
  { id: 'custom', label: 'Custom', count: null }
];

function App() {
  const [gameStarted, setGameStarted] = useState(false);
  const [currentWord, setCurrentWord] = useState(null);
  const [userInput, setUserInput] = useState('');
  const [isWrong, setIsWrong] = useState(false);
  const [loading, setLoading] = useState(false);

  // Difficulty: 'easy' | 'medium' | 'hard' | 'random'
  const [difficulty, setDifficulty] = useState('medium');

  // Game Mode: 'speed' | 'blitz' | 'casual' | 'endless' | 'hardcore'
  const [mode, setMode] = useState('speed');

  // Endless Mode Timer Toggle (Timed 20s vs Untimed)
  const [endlessTimed, setEndlessTimed] = useState(false);

  // Word Count Limits (for non-endless modes)
  const [wordCountOption, setWordCountOption] = useState('10');
  const [customWordCount, setCustomWordCount] = useState(10);

  // Round Progression Tracking
  const [currentWordNumber, setCurrentWordNumber] = useState(1);
  const [roundSolvedCount, setRoundSolvedCount] = useState(0);
  const [isRoundComplete, setIsRoundComplete] = useState(false);

  // Hints State: category, definition, first-letter for current word
  const [hints, setHints] = useState({
    category: null,
    definition: null,
    'first-letter': null
  });
  const [loadingHint, setLoadingHint] = useState(null);

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

  // Effective round target word count
  const isEndlessMode = mode === 'endless';
  const targetWordsCount = isEndlessMode
    ? Infinity
    : wordCountOption === 'custom'
    ? Math.max(1, parseInt(customWordCount, 10) || 10)
    : parseInt(wordCountOption, 10) || 10;

  // Active duration for timer based on mode
  const getActiveDuration = useCallback(
    (targetMode = mode) => {
      if (targetMode === 'endless') {
        return endlessTimed ? 20 : null;
      }
      return MODE_CONFIG[targetMode]?.duration || null;
    },
    [mode, endlessTimed]
  );

  // User is locked in settings while a game is actively running
  const isLocked = gameStarted && !isTimeUp && !isRoundComplete;

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
      const duration = getActiveDuration(activeMode);
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
    [mode, difficulty, getActiveDuration]
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
    const duration = getActiveDuration(mode);

    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    if (
      !duration ||
      !gameStarted ||
      loading ||
      isTimeUp ||
      isRoundComplete ||
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
  }, [
    mode,
    gameStarted,
    loading,
    isTimeUp,
    isRoundComplete,
    currentWord,
    showQuitModal,
    getActiveDuration,
    handleTimeUp
  ]);

  // Start the game on clicking "Play"
  const handleStartGame = async () => {
    if (mode === 'hardcore') {
      setHardcoreSkipsLeft(3);
      setHardcoreHintsLeft({
        category: 1,
        definition: 1,
        'first-letter': 1
      });
    }

    setScore(0);
    setStreak(0);
    setCurrentWordNumber(1);
    setRoundSolvedCount(0);
    setIsRoundComplete(false);
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
    setCurrentWordNumber(1);
    setRoundSolvedCount(0);
    setIsRoundComplete(false);
    setStreakBrokenNotice(false);
    setSuccessToast(null);
    await fetchNewWord();
  };

  // Restart standard round from completion
  const handleRestartRound = async () => {
    setScore(0);
    setStreak(0);
    setCurrentWordNumber(1);
    setRoundSolvedCount(0);
    setIsRoundComplete(false);
    setStreakBrokenNotice(false);
    setSuccessToast(null);
    await fetchNewWord();
  };

  // Focus input when a new word is displayed or user plays again
  useEffect(() => {
    if (gameStarted && !isTimeUp && !isRoundComplete && !showQuitModal && inputRef.current) {
      inputRef.current.focus();
    }
  }, [currentWord, gameStarted, isTimeUp, isRoundComplete, showQuitModal]);

  // Handle checking submitted answer
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!currentWord || !userInput.trim() || loading || isTimeUp || isRoundComplete || showQuitModal) return;

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

        // Base points according to that specific word's difficulty (10 easy, 12 medium, 15 hard)
        const wordDiff = currentWord.difficulty || (difficulty === 'random' ? 'medium' : difficulty);
        const basePts = DIFFICULTY_CONFIG[wordDiff]?.basePoints || 12;
        const streakBonus = (newStreak - 1) * 2;
        let pointsEarned = basePts + streakBonus;

        // In Hardcore mode, bonus multiplier for high stakes!
        if (mode === 'hardcore') {
          pointsEarned += 5;
        }

        // Speed bonus if solved with half or more time remaining
        const maxTime = getActiveDuration(mode);
        let hasSpeedBonus = false;
        if (maxTime && timeLeft >= Math.floor(maxTime / 2)) {
          pointsEarned += 5;
          hasSpeedBonus = true;
        }

        const newScore = score + pointsEarned;
        setScore(newScore);

        // Increment solved counter for this round
        const newSolvedCount = roundSolvedCount + 1;
        setRoundSolvedCount(newSolvedCount);

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

        // Check if round limit reached
        if (!isEndlessMode && currentWordNumber >= targetWordsCount) {
          setIsRoundComplete(true);
          if (timerRef.current) clearInterval(timerRef.current);
          endTimeRef.current = null;
          return;
        }

        // Advance to next word
        setCurrentWordNumber((prev) => prev + 1);
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

    // Check if skipping the last word completes the round
    if (!isEndlessMode && currentWordNumber >= targetWordsCount) {
      setIsRoundComplete(true);
      if (timerRef.current) clearInterval(timerRef.current);
      endTimeRef.current = null;
      return;
    }

    setCurrentWordNumber((prev) => prev + 1);
    fetchNewWord();
  };

  // Advance word after time-up (loss)
  const handleNextWordAfterTimeUp = () => {
    if (!isEndlessMode && currentWordNumber >= targetWordsCount) {
      setIsRoundComplete(true);
      setIsTimeUp(false);
      return;
    }

    setCurrentWordNumber((prev) => prev + 1);
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

    const activeDuration = getActiveDuration(mode);
    if (pausedRemainingMsRef.current && activeDuration) {
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
    setIsRoundComplete(false);
    setRevealedAnswer(null);
    setCurrentWord(null);
    setUserInput('');
    setHints({ category: null, definition: null, 'first-letter': null });
    setSuccessToast(null);
    setStreakBrokenNotice(false);
    setTimeLeft(getActiveDuration(mode));
  };

  // Switch game mode (Only allowed when not locked in active gameplay)
  const handleModeChange = (newMode) => {
    if (isLocked || newMode === mode) return;
    setMode(newMode);
    setTimeLeft(getActiveDuration(newMode));
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
  const maxDuration = getActiveDuration(mode);
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

  // Get active display difficulty for badge
  const displayDifficulty = currentWord?.difficulty || (difficulty === 'random' ? 'medium' : difficulty);

  return (
    <main>
      <h1>Jumbled Word Generator</h1>

      {/* Settings Bar: Mode, Word Limit, and Difficulty */}
      <div className="settings-bar">
        <div className="selectors-row">
          {/* Game Mode Selector */}
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

          {/* Endless Timer Sub-toggle (Shown when Endless Mode is selected) */}
          {mode === 'endless' && (
            <div className="selector-group">
              <span className="selector-label">Endless Timer</span>
              <nav
                className={`mode-selector ${isLocked ? 'locked' : ''}`}
                aria-label="Endless Timer Mode"
              >
                <button
                  type="button"
                  className={`mode-btn ${!endlessTimed ? 'active' : ''}`}
                  disabled={isLocked}
                  onClick={() => {
                    setEndlessTimed(false);
                    setTimeLeft(null);
                  }}
                >
                  🧘 Untimed
                </button>
                <button
                  type="button"
                  className={`mode-btn ${endlessTimed ? 'active' : ''}`}
                  disabled={isLocked}
                  onClick={() => {
                    setEndlessTimed(true);
                    setTimeLeft(20);
                  }}
                >
                  ⏱️ Timed (20s)
                </button>
              </nav>
            </div>
          )}

          {/* Word Count Goal (Shown for non-endless modes) */}
          {mode !== 'endless' && (
            <div className="selector-group">
              <span className="selector-label">Words to Play</span>
              <nav
                className={`word-count-selector ${isLocked ? 'locked' : ''}`}
                aria-label="Words Goal"
              >
                {WORD_COUNT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`word-count-btn ${wordCountOption === opt.id ? 'active' : ''}`}
                    disabled={isLocked}
                    onClick={() => setWordCountOption(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
                {wordCountOption === 'custom' && (
                  <input
                    type="number"
                    min="1"
                    max="100"
                    className="custom-count-input"
                    value={customWordCount}
                    onChange={(e) => setCustomWordCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    disabled={isLocked}
                    title="Enter custom word count"
                  />
                )}
              </nav>
            </div>
          )}

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
          Play ({mode === 'endless' ? 'Endless' : `${targetWordsCount} Words`} • {DIFFICULTY_CONFIG[difficulty]?.label})
        </button>
      )}

      {gameStarted && (
        <article className="result">
          {/* Active Countdown Timer */}
          {maxDuration && !loading && !isTimeUp && !isRoundComplete && (
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

          {/* Round Complete / Victory Screen */}
          {!loading && isRoundComplete && (
            <div className="round-complete-card">
              <h2 className="round-complete-title">🎉 Round Complete!</h2>
              <p>You finished all {targetWordsCount} words!</p>
              <div className="round-stats-grid">
                <div className="round-stat-item">
                  <div className="round-stat-item-label">Words Solved</div>
                  <div className="round-stat-item-value">
                    {roundSolvedCount} / {targetWordsCount}
                  </div>
                </div>
                <div className="round-stat-item">
                  <div className="round-stat-item-label">Accuracy</div>
                  <div className="round-stat-item-value">
                    {Math.round((roundSolvedCount / targetWordsCount) * 100)}%
                  </div>
                </div>
                <div className="round-stat-item">
                  <div className="round-stat-item-label">Final Score</div>
                  <div className="round-stat-item-value">{score}</div>
                </div>
                <div className="round-stat-item">
                  <div className="round-stat-item-label">Best Streak</div>
                  <div className="round-stat-item-value">🔥 {bestStreak}</div>
                </div>
              </div>
              <div className="button-group">
                <button id="again-btn" onClick={handleRestartRound}>
                  Play Again
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={handleConfirmQuit}
                >
                  Change Settings
                </button>
              </div>
            </div>
          )}

          {/* Time's Up State (Lost / Ended) */}
          {!loading && isTimeUp && !isRoundComplete && (
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
                  Final Score: {score} • Best Run Streak: {streak}
                </p>
              )}
              <div className="button-group">
                <button
                  id="again-btn"
                  onClick={
                    mode === 'hardcore'
                      ? handleRestartHardcore
                      : handleNextWordAfterTimeUp
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
          {!loading && !isTimeUp && !isRoundComplete && currentWord && (
            <>
              {/* Word Progress & Difficulty Tags */}
              <div>
                <span className={`progress-badge ${isEndlessMode ? 'endless' : ''}`}>
                  {isEndlessMode ? `Word ${currentWordNumber} (Endless)` : `Word ${currentWordNumber} of ${targetWordsCount}`}
                </span>
                {' '}
                <span
                  className={`difficulty-tag ${DIFFICULTY_CONFIG[displayDifficulty]?.badgeClass}`}
                >
                  {difficulty === 'random'
                    ? `🎲 Random (${displayDifficulty.toUpperCase()})`
                    : DIFFICULTY_CONFIG[displayDifficulty]?.label}
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
