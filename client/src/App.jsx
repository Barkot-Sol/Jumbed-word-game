import { useState, useRef, useEffect, useCallback } from 'react';

const MODE_CONFIG = {
  speed: { label: 'Speed (20s)', duration: 20 },
  blitz: { label: 'Blitz (10s)', duration: 10 },
  casual: { label: 'Casual', duration: null },
  endless: { label: 'Endless', duration: null, isEndless: true },
  hardcore: { label: 'Hardcore (15s)', duration: 15, isHardcore: true }
};

const DIFFICULTY_CONFIG = {
  easy: { label: 'Easy', desc: '5-6 letters', basePoints: 10, badgeClass: 'easy' },
  medium: { label: 'Medium', desc: '7-8 letters', basePoints: 12, badgeClass: 'medium' },
  hard: { label: 'Hard', desc: '9+ letters', basePoints: 15, badgeClass: 'hard' },
  random: { label: 'Random', desc: 'Mixed', basePoints: 12, badgeClass: 'random' }
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
  const [letters, setLetters] = useState([]);
  const [isWrong, setIsWrong] = useState(false);
  const [loading, setLoading] = useState(false);

  // Difficulty: 'easy' | 'medium' | 'hard' | 'random'
  const [difficulty, setDifficulty] = useState('random');

  // Game Mode: 'speed' | 'blitz' | 'casual' | 'endless' | 'hardcore'
  const [mode, setMode] = useState('speed');

  // Endless Mode Timer Settings ('untimed' | '60' | '120' | 'custom')
  const [endlessTimerOption, setEndlessTimerOption] = useState('60');
  const [customEndlessTime, setCustomEndlessTime] = useState(90);
  const [endlessInitialDuration, setEndlessInitialDuration] = useState(60);

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

  // Score & Streak tracking (Individual streak & best streak per mode; casual mode has no streaks)
  const [score, setScore] = useState(0);
  const [streaks, setStreaks] = useState({
    speed: 0,
    blitz: 0,
    endless: 0,
    hardcore: 0
  });
  const [bestStreaks, setBestStreaks] = useState(() => {
    const saved = localStorage.getItem('jumble_best_streaks_v2');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse best streaks:', e);
      }
    }
    const legacyBest = parseInt(localStorage.getItem('jumble_best_streak') || '0', 10);
    return {
      speed: legacyBest,
      blitz: 0,
      endless: 0,
      hardcore: 0
    };
  });
  const [highScores, setHighScores] = useState(() => {
    const saved = localStorage.getItem('jumble_high_scores_v2');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse high scores:', e);
      }
    }
    const legacyHigh = parseInt(localStorage.getItem('jumble_high_score') || '0', 10);
    return {
      speed: legacyHigh,
      blitz: 0,
      casual: 0,
      endless: 0,
      hardcore: 0
    };
  });

  const currentStreak = mode === 'casual' ? 0 : (streaks[mode] || 0);
  const currentBestStreak = mode === 'casual' ? 0 : (bestStreaks[mode] || 0);
  const currentHighScore = highScores[mode] || 0;

  // Non-blocking quick feedback
  const [successToast, setSuccessToast] = useState(null);
  const [isInputFlashing, setIsInputFlashing] = useState(false);
  const [streakBrokenNotice, setStreakBrokenNotice] = useState(false);
  const [skipPenaltyNotice, setSkipPenaltyNotice] = useState(false);

  // Quit confirmation & clock pause state
  const [showQuitModal, setShowQuitModal] = useState(false);

  const inputRef = useRef(null);
  const boxRefs = useRef([]);
  const timerRef = useRef(null);
  const endTimeRef = useRef(null);
  const pausedRemainingMsRef = useRef(null);
  const toastTimeoutRef = useRef(null);

  // Effective round target word count
  const isEndlessMode = mode === 'endless';
  const isEndlessTimed = isEndlessMode && endlessTimerOption !== 'untimed';
  const targetWordsCount = isEndlessMode
    ? Infinity
    : wordCountOption === 'custom'
      ? Math.max(1, parseInt(customWordCount, 10) || 10)
      : parseInt(wordCountOption, 10) || 10;

  // Initial duration for endless timed mode
  const getEndlessInitialDuration = useCallback(() => {
    if (endlessTimerOption === '60') return 60;
    if (endlessTimerOption === '120') return 120;
    if (endlessTimerOption === 'custom') {
      return Math.max(5, parseInt(customEndlessTime, 10) || 60);
    }
    return null;
  }, [endlessTimerOption, customEndlessTime]);

  // Active duration for timer based on mode
  const getActiveDuration = useCallback(
    (targetMode = mode) => {
      if (targetMode === 'endless') {
        return endlessTimerOption !== 'untimed' ? getEndlessInitialDuration() : null;
      }
      return MODE_CONFIG[targetMode]?.duration || null;
    },
    [mode, endlessTimerOption, getEndlessInitialDuration]
  );

  // User is locked in settings while a game is actively running
  const isLocked = gameStarted && !isTimeUp && !isRoundComplete;

  // Fetch word reveal when time runs out (Loss in timed mode)
  // Helper to focus the current active/empty letter box
  const focusActiveBox = useCallback(() => {
    if (!gameStarted || isTimeUp || isRoundComplete || showQuitModal) return;
    const emptyIndex = letters.findIndex((l) => !l);
    const targetIdx = emptyIndex !== -1 ? emptyIndex : Math.max(0, letters.length - 1);
    const targetEl = boxRefs.current[targetIdx] || inputRef.current;
    if (targetEl) {
      targetEl.focus();
    }
  }, [gameStarted, isTimeUp, isRoundComplete, showQuitModal, letters]);

  // Fetch word reveal when time runs out (Loss in timed mode)
  const handleTimeUp = useCallback(async (wordId) => {
    setIsTimeUp(true);
    setIsWrong(false);
    endTimeRef.current = null;
    pausedRemainingMsRef.current = null;

    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    // Break active streak for current mode (casual mode has no streak)
    if (mode !== 'casual') {
      setStreaks((prev) => {
        if ((prev[mode] || 0) > 0) {
          setStreakBrokenNotice(true);
          setTimeout(() => setStreakBrokenNotice(false), 3000);
        }
        return { ...prev, [mode]: 0 };
      });
    }

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
  }, [mode]);

  // Fetch a new jumbled word from Express backend by difficulty
  const fetchNewWord = useCallback(
    async (activeMode = mode, activeDifficulty = difficulty, isInitialStart = false) => {
      setLoading(true);
      setIsWrong(false);
      setIsTimeUp(false);
      setRevealedAnswer(null);
      setUserInput('');
      setLetters([]);
      setHints({ category: null, definition: null, 'first-letter': null });
      setLoadingHint(null);

      // Initialize countdown timer with precision timestamp
      if (activeMode === 'endless') {
        if (endlessTimerOption !== 'untimed') {
          if (isInitialStart) {
            const duration = getEndlessInitialDuration();
            setEndlessInitialDuration(duration);
            endTimeRef.current = Date.now() + duration * 1000;
            pausedRemainingMsRef.current = null;
            setTimeLeft(duration);
          }
        } else {
          endTimeRef.current = null;
          pausedRemainingMsRef.current = null;
          setTimeLeft(null);
        }
      } else {
        const duration = MODE_CONFIG[activeMode]?.duration || null;
        if (duration) {
          endTimeRef.current = Date.now() + duration * 1000;
          pausedRemainingMsRef.current = null;
          setTimeLeft(duration);
        } else {
          endTimeRef.current = null;
          pausedRemainingMsRef.current = null;
          setTimeLeft(null);
        }
      }

      const fetchStart = Date.now();
      try {
        const res = await fetch(`/api/words/random?difficulty=${activeDifficulty}`);
        if (!res.ok) throw new Error('Failed to load word');
        const data = await res.json();
        setCurrentWord(data);
      } catch (err) {
        console.error('Error fetching random word:', err);
      } finally {
        if (activeMode === 'endless' && endlessTimerOption !== 'untimed' && !isInitialStart && endTimeRef.current) {
          const latency = Date.now() - fetchStart;
          endTimeRef.current += latency;
        }
        setLoading(false);
      }
    },
    [mode, difficulty, endlessTimerOption, getEndlessInitialDuration]
  );

  // Synchronize letters array whenever current word updates
  useEffect(() => {
    if (currentWord?.jumbled) {
      const len = currentWord.jumbled.length;
      setLetters(Array(len).fill(''));
      setUserInput('');
      setTimeout(() => {
        boxRefs.current[0]?.focus();
      }, 50);
    } else {
      setLetters([]);
      setUserInput('');
    }
  }, [currentWord]);

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
      focusActiveBox();
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
    if (mode !== 'casual') {
      setStreaks((prev) => ({ ...prev, [mode]: 0 }));
    }
    setCurrentWordNumber(1);
    setRoundSolvedCount(0);
    setIsRoundComplete(false);
    setIsTimeUp(false);
    setRevealedAnswer(null);
    setGameStarted(true);
    setStreakBrokenNotice(false);
    setSkipPenaltyNotice(false);
    setSuccessToast(null);
    await fetchNewWord(mode, difficulty, true);
  };

  // Restart endless timed run from Game Over
  const handleRestartEndlessTimed = async () => {
    setScore(0);
    setStreaks((prev) => ({ ...prev, endless: 0 }));
    setCurrentWordNumber(1);
    setRoundSolvedCount(0);
    setIsRoundComplete(false);
    setIsTimeUp(false);
    setRevealedAnswer(null);
    setStreakBrokenNotice(false);
    setSkipPenaltyNotice(false);
    setSuccessToast(null);
    await fetchNewWord(mode, difficulty, true);
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
    setStreaks((prev) => ({ ...prev, hardcore: 0 }));
    setCurrentWordNumber(1);
    setRoundSolvedCount(0);
    setIsRoundComplete(false);
    setIsTimeUp(false);
    setRevealedAnswer(null);
    setStreakBrokenNotice(false);
    setSkipPenaltyNotice(false);
    setSuccessToast(null);
    await fetchNewWord(mode, difficulty, true);
  };

  // Restart standard round from completion
  const handleRestartRound = async () => {
    setScore(0);
    if (mode !== 'casual') {
      setStreaks((prev) => ({ ...prev, [mode]: 0 }));
    }
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

  // Handle typing and auto-advancing across Wordle letter boxes
  const handleBoxChange = (index, e) => {
    const val = e.target.value;
    const char = val.slice(-1).toUpperCase();

    if (!val) {
      const newLetters = [...letters];
      newLetters[index] = '';
      setLetters(newLetters);
      setUserInput(newLetters.join(''));
      if (isWrong) setIsWrong(false);
      return;
    }

    if (!/^[A-Z]$/.test(char)) return;

    const newLetters = [...letters];
    newLetters[index] = char;
    setLetters(newLetters);
    setUserInput(newLetters.join(''));
    if (isWrong) setIsWrong(false);

    if (index < letters.length - 1) {
      boxRefs.current[index + 1]?.focus();
      boxRefs.current[index + 1]?.select();
    }
  };

  const handleBoxKeyDown = (index, e) => {
    if (isWrong) setIsWrong(false);

    if (e.key === 'Backspace') {
      if (!letters[index] && index > 0) {
        e.preventDefault();
        const newLetters = [...letters];
        newLetters[index - 1] = '';
        setLetters(newLetters);
        setUserInput(newLetters.join(''));
        boxRefs.current[index - 1]?.focus();
        boxRefs.current[index - 1]?.select();
      } else if (letters[index]) {
        e.preventDefault();
        const newLetters = [...letters];
        newLetters[index] = '';
        setLetters(newLetters);
        setUserInput(newLetters.join(''));
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      boxRefs.current[index - 1]?.focus();
      boxRefs.current[index - 1]?.select();
    } else if (e.key === 'ArrowRight' && index < letters.length - 1) {
      e.preventDefault();
      boxRefs.current[index + 1]?.focus();
      boxRefs.current[index + 1]?.select();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleBoxPaste = (index, e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').trim().replace(/[^a-zA-Z]/g, '').toUpperCase();
    if (!pasted) return;

    const newLetters = [...letters];
    let lastIndex = index;
    for (let i = 0; i < pasted.length && index + i < letters.length; i++) {
      newLetters[index + i] = pasted[i];
      lastIndex = index + i;
    }
    setLetters(newLetters);
    setUserInput(newLetters.join(''));
    if (isWrong) setIsWrong(false);

    const nextFocus = Math.min(lastIndex + 1, letters.length - 1);
    boxRefs.current[nextFocus]?.focus();
    boxRefs.current[nextFocus]?.select();
  };

  // Handle checking submitted answer
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    const answerAttempt = letters.join('').trim() || userInput.trim();
    if (!currentWord || !answerAttempt || loading || isTimeUp || isRoundComplete || showQuitModal) return;

    try {
      const res = await fetch('/api/words/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentWord.id,
          answer: answerAttempt
        })
      });

      const data = await res.json();

      if (data.correct) {
        setIsWrong(false);
        setStreakBrokenNotice(false);
        setSkipPenaltyNotice(false);

        // Flash input border green for quick delightful feedback
        setIsInputFlashing(true);
        setTimeout(() => setIsInputFlashing(false), 300);

        // In endless timed mode, gain 5 seconds!
        if (isEndlessTimed && endTimeRef.current) {
          endTimeRef.current += 5000;
          setTimeLeft((prev) => (prev !== null ? prev + 5 : 5));
        }

        // Word difficulty base points (10 easy, 12 medium, 15 hard)
        const wordDiff = currentWord.difficulty || (difficulty === 'random' ? 'medium' : difficulty);
        const basePts = DIFFICULTY_CONFIG[wordDiff]?.basePoints || 12;

        let pointsEarned = basePts;
        let hasSpeedBonus = false;
        let newStreak = 0;

        // Streaks and streak bonus are completely disabled for casual mode
        if (mode !== 'casual') {
          newStreak = (streaks[mode] || 0) + 1;
          setStreaks((prev) => ({ ...prev, [mode]: newStreak }));

          const streakBonus = (newStreak - 1) * 2;
          pointsEarned += streakBonus;

          if (mode === 'hardcore') {
            pointsEarned += 5;
          }

          if (mode !== 'endless') {
            const maxTime = getActiveDuration(mode);
            if (maxTime && timeLeft >= Math.floor(maxTime / 2)) {
              pointsEarned += 5;
              hasSpeedBonus = true;
            }
          }

          if (newStreak > (bestStreaks[mode] || 0)) {
            setBestStreaks((prev) => {
              const updated = { ...prev, [mode]: newStreak };
              localStorage.setItem('jumble_best_streaks_v2', JSON.stringify(updated));
              return updated;
            });
          }
        }

        const newScore = score + pointsEarned;
        setScore(newScore);

        // Update high score per mode
        if (newScore > (highScores[mode] || 0)) {
          setHighScores((prev) => {
            const updated = { ...prev, [mode]: newScore };
            localStorage.setItem('jumble_high_scores_v2', JSON.stringify(updated));
            return updated;
          });
        }

        // Increment solved counter for this round
        const newSolvedCount = roundSolvedCount + 1;
        setRoundSolvedCount(newSolvedCount);

        // Floating toast (hide streak info in casual mode)
        if (toastTimeoutRef.current) {
          clearTimeout(toastTimeoutRef.current);
        }
        setSuccessToast({
          points: pointsEarned,
          streak: mode === 'casual' ? 0 : newStreak,
          speedBonus: mode === 'casual' ? false : hasSpeedBonus,
          timeBonus: isEndlessTimed ? 5 : null
        });
        toastTimeoutRef.current = setTimeout(() => {
          setSuccessToast(null);
        }, 1800);

        // Check if round limit reached
        if (!isEndlessMode && currentWordNumber >= targetWordsCount) {
          setIsRoundComplete(true);
          if (timerRef.current) clearInterval(timerRef.current);
          endTimeRef.current = null;
          return;
        }

        // Advance to next word
        setCurrentWordNumber((prev) => prev + 1);
        fetchNewWord(mode, difficulty, false);
      } else {
        // Red shaking of text boxes on wrong answer
        setIsWrong(true);
        setTimeout(() => {
          setIsWrong(false);
        }, 550);
        focusActiveBox();
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

    // In endless timed, user loses 5 seconds
    if (isEndlessTimed && endTimeRef.current) {
      endTimeRef.current -= 5000;
      const remainingMs = endTimeRef.current - Date.now();
      const remainingSec = Math.ceil(remainingMs / 1000);

      if (remainingSec <= 0) {
        setTimeLeft(0);
        handleTimeUp(currentWord?.id);
        return;
      }

      setTimeLeft(remainingSec);
      setSkipPenaltyNotice(true);
      setTimeout(() => setSkipPenaltyNotice(false), 2500);
    }

    if (mode !== 'casual') {
      const activeStreak = streaks[mode] || 0;
      if (!isTimeUp && activeStreak > 0) {
        setStreaks((prev) => ({ ...prev, [mode]: 0 }));
        setStreakBrokenNotice(true);
        setTimeout(() => setStreakBrokenNotice(false), 3000);
      } else {
        setStreakBrokenNotice(false);
      }
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
    fetchNewWord(mode, difficulty, false);
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

    if (mode !== 'casual') {
      setStreaks((prev) => ({ ...prev, [mode]: 0 }));
    }

    setGameStarted(false);
    setIsWrong(false);
    setIsTimeUp(false);
    setIsRoundComplete(false);
    setRevealedAnswer(null);
    setCurrentWord(null);
    setUserInput('');
    setLetters([]);
    setHints({ category: null, definition: null, 'first-letter': null });
    setSuccessToast(null);
    setStreakBrokenNotice(false);
    setSkipPenaltyNotice(false);
    setTimeLeft(mode === 'endless' ? (endlessTimerOption === 'untimed' ? null : getEndlessInitialDuration()) : getActiveDuration(mode));
  };

  // Switch game mode (Only allowed when not locked in active gameplay)
  const handleModeChange = (newMode) => {
    if (isLocked || newMode === mode) return;
    setMode(newMode);
    if (newMode === 'endless') {
      setTimeLeft(endlessTimerOption !== 'untimed' ? getEndlessInitialDuration() : null);
    } else {
      setTimeLeft(MODE_CONFIG[newMode]?.duration || null);
    }
  };

  // Switch endless timer mode option ('untimed' | '60' | '120' | 'custom')
  const handleEndlessTimerOptionChange = (option) => {
    if (isLocked) return;
    setEndlessTimerOption(option);
    if (option === 'untimed') {
      setTimeLeft(null);
    } else if (option === '60') {
      setTimeLeft(60);
      setEndlessInitialDuration(60);
    } else if (option === '120') {
      setTimeLeft(120);
      setEndlessInitialDuration(120);
    } else if (option === 'custom') {
      const val = Math.max(5, parseInt(customEndlessTime, 10) || 60);
      setTimeLeft(val);
      setEndlessInitialDuration(val);
    }
  };

  const handleCustomEndlessTimeChange = (e) => {
    const val = Math.max(5, Math.min(3600, parseInt(e.target.value, 10) || 5));
    setCustomEndlessTime(val);
    if (endlessTimerOption === 'custom') {
      setTimeLeft(val);
      setEndlessInitialDuration(val);
    }
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

  // Keep focus on active box when clicking anywhere on website (excluding controls/modals)
  useEffect(() => {
    const handleGlobalClick = (e) => {
      if (!gameStarted || isTimeUp || isRoundComplete || showQuitModal) return;
      if (e.target.closest('input, select, textarea, .modal-box')) return;
      if (e.target.closest('button')) return;
      focusActiveBox();
    };

    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [focusActiveBox, gameStarted, isTimeUp, isRoundComplete, showQuitModal]);

  // Global keydown listener so typing letters, Backspace, or Enter always types into boxes
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (!gameStarted || isTimeUp || isRoundComplete || showQuitModal || loading) return;

      const activeEl = document.activeElement;
      if (activeEl?.classList?.contains('wordle-box')) return;
      if (['input', 'textarea', 'select'].includes(activeEl?.tagName?.toLowerCase())) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
        return;
      }

      if (e.key === 'Backspace') {
        e.preventDefault();
        let lastFilled = -1;
        for (let i = letters.length - 1; i >= 0; i--) {
          if (letters[i]) {
            lastFilled = i;
            break;
          }
        }
        if (lastFilled !== -1) {
          const newLetters = [...letters];
          newLetters[lastFilled] = '';
          setLetters(newLetters);
          setUserInput(newLetters.join(''));
          boxRefs.current[lastFilled]?.focus();
        } else {
          boxRefs.current[0]?.focus();
        }
        return;
      }

      if (/^[a-zA-Z]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const char = e.key.toUpperCase();
        const emptyIdx = letters.findIndex((l) => !l);
        const targetIdx = emptyIdx !== -1 ? emptyIdx : Math.max(0, letters.length - 1);
        const newLetters = [...letters];
        newLetters[targetIdx] = char;
        setLetters(newLetters);
        setUserInput(newLetters.join(''));
        if (isWrong) setIsWrong(false);

        const nextFocus = Math.min(targetIdx + 1, letters.length - 1);
        boxRefs.current[nextFocus]?.focus();
        boxRefs.current[nextFocus]?.select();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [gameStarted, isTimeUp, isRoundComplete, showQuitModal, loading, letters, isWrong]);

  // Timer color severity and display
  const maxDuration = isEndlessTimed
    ? endlessInitialDuration || getEndlessInitialDuration() || 60
    : getActiveDuration(mode);
  const timerPercentage = maxDuration ? Math.min(100, Math.max(0, (timeLeft / maxDuration) * 100)) : 100;
  const isWarning = isEndlessTimed
    ? timeLeft <= 15 && timeLeft > 5
    : maxDuration && timeLeft <= Math.ceil(maxDuration * 0.45) && timeLeft > 4;
  const isCritical = maxDuration && timeLeft <= (isEndlessTimed ? 5 : 4);

  const timerStatusClass = showQuitModal
    ? 'paused'
    : isCritical
      ? 'critical'
      : isWarning
        ? 'warning'
        : '';

  const formatTimeBadge = (seconds) => {
    if (showQuitModal) return 'Paused';
    if (seconds === null || seconds === undefined) return '';
    if (seconds >= 60) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    return `${seconds}s`;
  };

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
                className={`endless-timer-selector ${isLocked ? 'locked' : ''}`}
                aria-label="Endless Timer Mode"
              >
                <button
                  type="button"
                  className={`timer-option-btn ${endlessTimerOption === 'untimed' ? 'active' : ''}`}
                  disabled={isLocked}
                  onClick={() => handleEndlessTimerOptionChange('untimed')}
                >
                  Untimed
                </button>
                <button
                  type="button"
                  className={`timer-option-btn ${endlessTimerOption === '60' ? 'active' : ''}`}
                  disabled={isLocked}
                  onClick={() => handleEndlessTimerOptionChange('60')}
                >
                  1 Min
                </button>
                <button
                  type="button"
                  className={`timer-option-btn ${endlessTimerOption === '120' ? 'active' : ''}`}
                  disabled={isLocked}
                  onClick={() => handleEndlessTimerOptionChange('120')}
                >
                  2 Mins
                </button>
                <button
                  type="button"
                  className={`timer-option-btn ${endlessTimerOption === 'custom' ? 'active' : ''}`}
                  disabled={isLocked}
                  onClick={() => handleEndlessTimerOptionChange('custom')}
                >
                  Custom
                </button>
                {endlessTimerOption === 'custom' && (
                  <div className="custom-time-wrapper">
                    <input
                      type="number"
                      min="10"
                      max="600"
                      step="5"
                      className="custom-count-input"
                      value={customEndlessTime}
                      onChange={handleCustomEndlessTimeChange}
                      disabled={isLocked}
                      title="Enter custom timer in seconds"
                    />
                    <span className="custom-time-unit">sec</span>
                  </div>
                )}
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
            Settings locked • Finish round or Quit to change
          </span>
        )}
      </div>

      {/* Hardcore Mode Status Bar / Inventory */}
      {mode === 'hardcore' && (
        <section className="hardcore-hud" aria-label="Hardcore inventory">
          <div className="hardcore-hud-title">
            <span>Hardcore Rules</span>
          </div>
          <div className="hardcore-badges">
            <span
              className={`hardcore-pill ${hardcoreSkipsLeft > 0 ? 'active' : 'empty'}`}
            >
              Skips: {hardcoreSkipsLeft}/3
            </span>
            <span
              className={`hardcore-pill ${hardcoreHintsLeft.category > 0 ? 'active' : 'empty'}`}
            >
              Category: {hardcoreHintsLeft.category}/1
            </span>
            <span
              className={`hardcore-pill ${hardcoreHintsLeft.definition > 0 ? 'active' : 'empty'}`}
            >
              Definition: {hardcoreHintsLeft.definition}/1
            </span>
            <span
              className={`hardcore-pill ${hardcoreHintsLeft['first-letter'] > 0 ? 'active' : 'empty'}`}
            >
              1st Letter: {hardcoreHintsLeft['first-letter']}/1
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
        {mode !== 'casual' && (
          <>
            <div className={`stat-card ${currentStreak > 0 ? 'streak-active' : ''}`}>
              <span className="stat-label">Streak</span>
              <span className="stat-value streak">
                {currentStreak > 0 ? `${currentStreak}` : '0'}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Best Streak</span>
              <span className="stat-value best">{currentBestStreak}</span>
            </div>
          </>
        )}
        <div className="stat-card">
          <span className="stat-label">High Score</span>
          <span className="stat-value">{currentHighScore}</span>
        </div>
      </section>

      {!gameStarted && (
        <button id="start-btn" onClick={handleStartGame}>
          Play ({
            mode === 'endless'
              ? isEndlessTimed
                ? `Endless • ${endlessTimerOption === '60' ? '1 Min' : endlessTimerOption === '120' ? '2 Mins' : `${customEndlessTime}s`}`
                : 'Endless • Untimed'
              : `${targetWordsCount} Words`
          } • {DIFFICULTY_CONFIG[difficulty]?.label})
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
                  {formatTimeBadge(timeLeft)}
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
                <span>Correct! +{successToast.points} pts</span>
                {successToast.timeBonus && (
                  <span className="time-bonus-toast">+{successToast.timeBonus}s</span>
                )}
                {mode !== 'casual' && successToast.streak > 1 && (
                  <span>(Streak x{successToast.streak})</span>
                )}
                {mode !== 'casual' && successToast.speedBonus && <span>(Speed Bonus!)</span>}
              </div>
            )}
          </div>

          {loading && <p className="loading">Loading next word...</p>}

          {/* Round Complete / Victory Screen */}
          {!loading && isRoundComplete && (
            <div className="round-complete-card">
              <h2 className="round-complete-title">Round Complete!</h2>
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
                {mode !== 'casual' && (
                  <div className="round-stat-item">
                    <div className="round-stat-item-label">Best Streak</div>
                    <div className="round-stat-item-value">{currentBestStreak}</div>
                  </div>
                )}
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
                {mode === 'hardcore'
                  ? 'Game Over'
                  : isEndlessTimed
                    ? 'Time Expired - Run Ended!'
                    : "Time's Up!"}
              </p>
              {revealedAnswer && (
                <p className="revealed-answer">
                  The correct word was: <strong>{revealedAnswer}</strong>
                </p>
              )}
              {(mode === 'hardcore' || isEndlessTimed) && (
                <p className="hardcore-summary">
                  Final Score: {score} • Words Solved: {roundSolvedCount} • Best Streak: {currentStreak}
                </p>
              )}
              <div className="button-group">
                <button
                  id="again-btn"
                  onClick={
                    mode === 'hardcore'
                      ? handleRestartHardcore
                      : isEndlessTimed
                        ? handleRestartEndlessTimed
                        : handleNextWordAfterTimeUp
                  }
                >
                  {mode === 'hardcore'
                    ? 'Try Hardcore Again'
                    : isEndlessTimed
                      ? 'Play Endless Again'
                      : 'Try Next Word'}
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
                  {isEndlessMode
                    ? `Word ${currentWordNumber} (Endless${isEndlessTimed ? ' • Timed' : ''})`
                    : `Word ${currentWordNumber} of ${targetWordsCount}`}
                </span>
                {' '}
                <span
                  className={`difficulty-tag ${DIFFICULTY_CONFIG[displayDifficulty]?.badgeClass}`}
                >
                  {difficulty === 'random'
                    ? `Random (${displayDifficulty.toUpperCase()})`
                    : DIFFICULTY_CONFIG[displayDifficulty]?.label}
                </span>
              </div>

              <p className="outcome">{currentWord.jumbled}</p>

              {/* Hints System */}
              <div className="hints-panel" onMouseDown={(e) => e.preventDefault()}>
                <div className="hints-header">
                  <span>
                    Hints {mode === 'hardcore' ? '(1 of each for entire run)' : ''}
                  </span>
                </div>
                <div className="hint-buttons-group">
                  <button
                    type="button"
                    className={`hint-btn ${hints.category ? 'revealed' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      handleGetHint('category');
                      focusActiveBox();
                    }}
                    disabled={
                      Boolean(hints.category) ||
                      (mode === 'hardcore' && hardcoreHintsLeft.category <= 0) ||
                      loadingHint === 'category' ||
                      showQuitModal
                    }
                  >
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
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      handleGetHint('definition');
                      focusActiveBox();
                    }}
                    disabled={
                      Boolean(hints.definition) ||
                      (mode === 'hardcore' && hardcoreHintsLeft.definition <= 0) ||
                      loadingHint === 'definition' ||
                      showQuitModal
                    }
                  >
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
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      handleGetHint('first-letter');
                      focusActiveBox();
                    }}
                    disabled={
                      Boolean(hints['first-letter']) ||
                      (mode === 'hardcore' && hardcoreHintsLeft['first-letter'] <= 0) ||
                      loadingHint === 'first-letter' ||
                      showQuitModal
                    }
                  >
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
                  <div className="hint-cards" onMouseDown={(e) => e.preventDefault()}>
                    {hints.category && (
                      <div className="hint-card category">
                        <span className="hint-card-label">Category:</span>
                        <span className="hint-card-content">{hints.category}</span>
                      </div>
                    )}
                    {hints.definition && (
                      <div className="hint-card definition">
                        <span className="hint-card-label">Definition:</span>
                        <span className="hint-card-content">{hints.definition}</span>
                      </div>
                    )}
                    {hints['first-letter'] && (
                      <div className="hint-card first-letter">
                        <span className="hint-card-label">First Letter:</span>
                        <span className="hint-card-content">
                          Starts with <strong>{hints['first-letter']}</strong>...
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <form onSubmit={handleSubmit} className="wordle-form">
                <div
                  className={`wordle-row ${isWrong ? 'shake' : ''} ${isInputFlashing ? 'bounce' : ''}`}
                  role="group"
                  aria-label="Word letters input"
                >
                  {Array.from({ length: currentWord.jumbled.length }).map((_, index) => {
                    const letter = letters[index] || '';
                    const isCorrectPlace =
                      mode === 'casual' &&
                      Boolean(currentWord.answer) &&
                      Boolean(letter) &&
                      letter.toLowerCase() === currentWord.answer[index]?.toLowerCase();
                    const isGreen = isCorrectPlace || isInputFlashing;

                    return (
                      <input
                        key={index}
                        ref={(el) => {
                          boxRefs.current[index] = el;
                          if (index === 0) inputRef.current = el;
                        }}
                        type="text"
                        inputMode="text"
                        maxLength={1}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="characters"
                        spellCheck="false"
                        id={index === 0 ? 'input' : `input-${index}`}
                        className={`wordle-box ${letter ? 'has-letter' : ''} ${isGreen ? 'box-correct' : ''}`}
                        value={letter}
                        onChange={(e) => handleBoxChange(index, e)}
                        onKeyDown={(e) => handleBoxKeyDown(index, e)}
                        onPaste={(e) => handleBoxPaste(index, e)}
                        onFocus={(e) => e.target.select()}
                        disabled={showQuitModal}
                        aria-label={`Letter ${index + 1} of ${currentWord.jumbled.length}`}
                      />
                    );
                  })}
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
                      : isEndlessTimed
                        ? 'Skip Word (-5s)'
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
              {skipPenaltyNotice && (
                <p className="time-penalty-notice">-5 seconds penalty for skip!</p>
              )}
              {mode !== 'casual' && streakBrokenNotice && (
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
            <span className="modal-paused-tag">Clock Paused</span>
            <h2 className="modal-title">Quit Current Mode?</h2>
            <p className="modal-message">
              {mode !== 'casual' && currentStreak > 0
                ? `Are you sure you want to quit? Your active streak of ${currentStreak} will be reset.`
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
