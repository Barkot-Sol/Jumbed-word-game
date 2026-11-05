/**
 * Dictionary API Word Provider
 * Fetches dynamic words, authentic definitions, and grammatical categories
 * via the Free Dictionary API and Datamuse API, with a robust seed fallback.
 */

// Categorized semantic topics for diverse vocabulary and meaningful category hints
const TOPICS = [
  { topic: 'nature', label: 'Nature & Environment' },
  { topic: 'science', label: 'Science & Discovery' },
  { topic: 'animals', label: 'Animals & Wildlife' },
  { topic: 'food', label: 'Food & Cuisine' },
  { topic: 'art', label: 'Art & Culture' },
  { topic: 'travel', label: 'Travel & Geography' },
  { topic: 'home', label: 'Objects & Daily Life' },
  { topic: 'sports', label: 'Sports & Games' },
  { topic: 'space', label: 'Space & Astronomy' },
  { topic: 'music', label: 'Music & Sound' },
  { topic: 'literature', label: 'Language & Thought' }
];

// Difficulty letter patterns
const DIFFICULTY_CONFIG = {
  easy: {
    minLen: 4,
    maxLen: 6,
    patterns: ['?????', '??????']
  },
  medium: {
    minLen: 7,
    maxLen: 8,
    patterns: ['???????', '????????']
  },
  hard: {
    minLen: 9,
    maxLen: 12,
    patterns: ['?????????', '??????????', '???????????']
  }
};

/**
 * Fisher-Yates shuffle algorithm to generate a valid anagram.
 * Guarantees that the jumbled word does not match the original answer.
 */
export function jumbleWord(word) {
  const letters = word.toLowerCase().split('');
  if (letters.length <= 1) return word;

  let shuffled;
  let attempts = 0;
  do {
    shuffled = [...letters];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    attempts++;
  } while (shuffled.join('') === word.toLowerCase() && attempts < 25);

  // If still matching after attempts (e.g. repeated letters), force swap differing letters
  if (shuffled.join('') === word.toLowerCase() && shuffled.length >= 2) {
    for (let i = 0; i < shuffled.length - 1; i++) {
      if (shuffled[i] !== shuffled[i + 1]) {
        [shuffled[i], shuffled[i + 1]] = [shuffled[i + 1], shuffled[i]];
        break;
      }
    }
  }

  return shuffled.join('');
}

/**
 * Parse and clean raw definition from Datamuse 'defs' entry
 */
function parseDatamuseDef(rawDef) {
  if (!rawDef) return { definition: '', partOfSpeech: 'General' };

  const parts = rawDef.split('\t');
  let posCode = '';
  let defText = rawDef;
  if (parts.length > 1) {
    posCode = parts[0].trim().toLowerCase();
    defText = parts.slice(1).join('\t').trim();
  }

  const posMap = {
    n: 'Noun',
    v: 'Verb',
    adj: 'Adjective',
    adv: 'Adverb',
    prop: 'Proper Noun'
  };
  const partOfSpeech = posMap[posCode] || 'General';

  // Strip technical usage tags like (transitive), (intransitive), etc.
  defText = defText.replace(/^(\([a-z\s,;-]+\)\s*)+/i, '').trim();

  if (defText.length > 0) {
    defText = defText.charAt(0).toUpperCase() + defText.slice(1);
    if (!defText.endsWith('.') && !defText.endsWith('!') && !defText.endsWith('?')) {
      defText += '.';
    }
  }

  return { definition: defText, partOfSpeech };
}

/**
 * Fetch rich definition from the Free Dictionary API (dictionaryapi.dev)
 */
async function fetchFromFreeDictionary(word) {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, {
      headers: { 'User-Agent': 'JumbleWordGame/2.0' },
      signal: AbortSignal.timeout(2500)
    });

    if (res.ok) {
      const data = await res.json();
      const firstEntry = data[0];
      const meaning = firstEntry?.meanings?.[0];
      const def = meaning?.definitions?.[0]?.definition;
      const pos = meaning?.partOfSpeech;

      if (def) {
        let cleanDef = def.trim();
        if (cleanDef.length > 0) {
          cleanDef = cleanDef.charAt(0).toUpperCase() + cleanDef.slice(1);
          if (!cleanDef.endsWith('.') && !cleanDef.endsWith('!') && !cleanDef.endsWith('?')) {
            cleanDef += '.';
          }
        }
        return {
          definition: cleanDef,
          partOfSpeech: pos ? pos.charAt(0).toUpperCase() + pos.slice(1) : 'General'
        };
      }
    }
  } catch {
    // Ignore timeout or network errors to fall back gracefully
  }
  return null;
}

/**
 * Fetch words from the Datamuse Dictionary API with definitions and parts of speech
 */
async function fetchWordsFromDictionaryApi(difficulty, count = 15) {
  const config = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.easy;
  const pattern = config.patterns[Math.floor(Math.random() * config.patterns.length)];
  const topicObj = TOPICS[Math.floor(Math.random() * TOPICS.length)];

  const url = `https://api.datamuse.com/words?topics=${topicObj.topic}&sp=${pattern}&md=dp&max=${count * 3}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!res.ok) return [];

    const rawWords = await res.json();
    const validCandidates = rawWords.filter((w) => {
      const word = w.word;
      return (
        /^[a-z]+$/i.test(word) &&
        word.length >= config.minLen &&
        word.length <= config.maxLen &&
        w.defs &&
        w.defs.length > 0 &&
        (w.score || 0) > 1000
      );
    });

    const results = [];
    for (const item of validCandidates) {
      if (results.length >= count) break;
      const word = item.word.toLowerCase();
      if (usedWordsSet.has(word)) continue;

      const parsedDef = parseDatamuseDef(item.defs[0]);
      if (!parsedDef.definition) continue;

      results.push({
        answer: word,
        difficulty,
        category: `${parsedDef.partOfSpeech} • ${topicObj.label}`,
        definition: parsedDef.definition,
        partOfSpeech: parsedDef.partOfSpeech,
        source: 'dictionary_api'
      });
    }

    return results;
  } catch (err) {
    console.error('Dictionary API fetch error:', err.message);
    return [];
  }
}

// Comprehensive seed dictionary bank with authentic definitions
// Used for immediate startup and 100% offline fallback resilience
const SEED_WORDS = [
  // --- EASY (4 - 6 letters) ---
  {
    answer: 'house',
    difficulty: 'easy',
    category: 'Noun • Objects & Daily Life',
    definition: 'A building designed for human habitation and family living.'
  },
  {
    answer: 'sphere',
    difficulty: 'easy',
    category: 'Noun • Science & Discovery',
    definition: 'A round three-dimensional shape where every point is equidistant from its center.'
  },
  {
    answer: 'broken',
    difficulty: 'easy',
    category: 'Adjective • Objects & Daily Life',
    definition: 'Fractured, damaged, or separated into parts and not functioning.'
  },
  {
    answer: 'ensure',
    difficulty: 'easy',
    category: 'Verb • Language & Thought',
    definition: 'To make certain that something will happen, be safe, or be true.'
  },
  {
    answer: 'trench',
    difficulty: 'easy',
    category: 'Noun • Travel & Geography',
    definition: 'A long, narrow, deep ditch cut into the earth.'
  },
  {
    answer: 'cousin',
    difficulty: 'easy',
    category: 'Noun • Objects & Daily Life',
    definition: 'A child of one’s aunt or uncle.'
  },
  {
    answer: 'quaint',
    difficulty: 'easy',
    category: 'Adjective • Art & Culture',
    definition: 'Charmingly old-fashioned, picturesque, or delightfully unusual.'
  },
  {
    answer: 'apple',
    difficulty: 'easy',
    category: 'Noun • Food & Cuisine',
    definition: 'A round fruit with red, green, or yellow skin and a firm, juicy interior.'
  },
  {
    answer: 'tiger',
    difficulty: 'easy',
    category: 'Noun • Animals & Wildlife',
    definition: 'A large solitary carnivorous mammal with distinctive orange and black stripes.'
  },
  {
    answer: 'planet',
    difficulty: 'easy',
    category: 'Noun • Space & Astronomy',
    definition: 'A large celestial body in space orbiting around a star.'
  },
  {
    answer: 'garden',
    difficulty: 'easy',
    category: 'Noun • Nature & Environment',
    definition: 'A plot of ground where herbs, fruits, flowers, or vegetables are cultivated.'
  },
  {
    answer: 'castle',
    difficulty: 'easy',
    category: 'Noun • Travel & Geography',
    definition: 'A large fortified building or set of buildings typical of the medieval era.'
  },
  {
    answer: 'silver',
    difficulty: 'easy',
    category: 'Noun • Science & Discovery',
    definition: 'A precious, shiny grayish-white metallic element of high value.'
  },
  {
    answer: 'bridge',
    difficulty: 'easy',
    category: 'Noun • Travel & Geography',
    definition: 'A structure built to span a physical obstacle like a river or road.'
  },
  {
    answer: 'solace',
    difficulty: 'easy',
    category: 'Noun • Language & Thought',
    definition: 'Comfort or consolation in a time of loneliness, sorrow, or distress.'
  },
  {
    answer: 'ardent',
    difficulty: 'easy',
    category: 'Adjective • Language & Thought',
    definition: 'Full of warmth, passion, spirit, or eager enthusiasm.'
  },
  {
    answer: 'placid',
    difficulty: 'easy',
    category: 'Adjective • Nature & Environment',
    definition: 'Calm and quiet; peaceful, serene, and tranquil.'
  },
  {
    answer: 'breeze',
    difficulty: 'easy',
    category: 'Noun • Nature & Environment',
    definition: 'A light, gentle, and refreshing wind.'
  },
  {
    answer: 'guitar',
    difficulty: 'easy',
    category: 'Noun • Music & Sound',
    definition: 'A stringed musical instrument played with the fingers or a pick.'
  },
  {
    answer: 'beacon',
    difficulty: 'easy',
    category: 'Noun • Travel & Geography',
    definition: 'A guiding signal, warning light, or prominent landmark.'
  },

  // --- MEDIUM (7 - 8 letters) ---
  {
    answer: 'reptile',
    difficulty: 'medium',
    category: 'Noun • Animals & Wildlife',
    definition: 'A cold-blooded vertebrate animal with scales or horny plates.'
  },
  {
    answer: 'perform',
    difficulty: 'medium',
    category: 'Verb • Art & Culture',
    definition: 'To carry out an action, display a talent, or stage a presentation.'
  },
  {
    answer: 'quarter',
    difficulty: 'medium',
    category: 'Noun • Science & Discovery',
    definition: 'One of four equal parts into which something is divided.'
  },
  {
    answer: 'storage',
    difficulty: 'medium',
    category: 'Noun • Objects & Daily Life',
    definition: 'The action, space, or method of keeping goods for future use.'
  },
  {
    answer: 'journey',
    difficulty: 'medium',
    category: 'Noun • Travel & Geography',
    definition: 'An act of traveling from one destination to another.'
  },
  {
    answer: 'fortune',
    difficulty: 'medium',
    category: 'Noun • Language & Thought',
    definition: 'Chance or luck as an external arbitrary force affecting human affairs.'
  },
  {
    answer: 'balance',
    difficulty: 'medium',
    category: 'Noun • Science & Discovery',
    definition: 'An even distribution of weight enabling someone or something to remain upright.'
  },
  {
    answer: 'harmony',
    difficulty: 'medium',
    category: 'Noun • Music & Sound',
    definition: 'The combination of simultaneously sounded musical notes to produce pleasing chords.'
  },
  {
    answer: 'climate',
    difficulty: 'medium',
    category: 'Noun • Nature & Environment',
    definition: 'The prevailing weather conditions in an area over a long period.'
  },
  {
    answer: 'diamond',
    difficulty: 'medium',
    category: 'Noun • Science & Discovery',
    definition: 'A precious, highly refractive gemstone of pure crystallized carbon.'
  },
  {
    answer: 'glacier',
    difficulty: 'medium',
    category: 'Noun • Nature & Environment',
    definition: 'A slowly moving mass or river of ice formed by the accumulation of snow.'
  },
  {
    answer: 'curious',
    difficulty: 'medium',
    category: 'Adjective • Language & Thought',
    definition: 'Eager to know or learn something; inquisitive.'
  },
  {
    answer: 'silence',
    difficulty: 'medium',
    category: 'Noun • Music & Sound',
    definition: 'Complete absence of sound or noise; quietness.'
  },
  {
    answer: 'horizon',
    difficulty: 'medium',
    category: 'Noun • Nature & Environment',
    definition: 'The line at which the earth’s surface and the sky appear to meet.'
  },
  {
    answer: 'compass',
    difficulty: 'medium',
    category: 'Noun • Travel & Geography',
    definition: 'An instrument containing a magnetized pointer that shows the direction of magnetic north.'
  },
  {
    answer: 'prudent',
    difficulty: 'medium',
    category: 'Adjective • Language & Thought',
    definition: 'Acting with or showing care, wisdom, and thought for the future.'
  },
  {
    answer: 'radiant',
    difficulty: 'medium',
    category: 'Adjective • Science & Discovery',
    definition: 'Sending out light; shining or glowing brightly.'
  },
  {
    answer: 'wildlife',
    difficulty: 'medium',
    category: 'Noun • Animals & Wildlife',
    definition: 'Wild animals and vegetation living in a natural, undomesticated state.'
  },

  // --- HARD (9 - 12 letters) ---
  {
    answer: 'philosophy',
    difficulty: 'hard',
    category: 'Noun • Language & Thought',
    definition: 'The study of the fundamental nature of knowledge, reality, and existence.'
  },
  {
    answer: 'catastrophe',
    difficulty: 'hard',
    category: 'Noun • Language & Thought',
    definition: 'An event causing great and often sudden damage or suffering; a disaster.'
  },
  {
    answer: 'equilibrium',
    difficulty: 'hard',
    category: 'Noun • Science & Discovery',
    definition: 'A state in which opposing forces or influences are balanced.'
  },
  {
    answer: 'magnificent',
    difficulty: 'hard',
    category: 'Adjective • Art & Culture',
    definition: 'Impressively beautiful, elaborate, or strikingly extravagant.'
  },
  {
    answer: 'astronomy',
    difficulty: 'hard',
    category: 'Noun • Space & Astronomy',
    definition: 'The branch of science which deals with celestial objects, space, and the universe.'
  },
  {
    answer: 'fascinating',
    difficulty: 'hard',
    category: 'Adjective • Language & Thought',
    definition: 'Extremely interesting, charming, and captivating.'
  },
  {
    answer: 'mysterious',
    difficulty: 'hard',
    category: 'Adjective • Art & Culture',
    definition: 'Difficult or impossible to understand, explain, or identify.'
  },
  {
    answer: 'wilderness',
    difficulty: 'hard',
    category: 'Noun • Nature & Environment',
    definition: 'An uncultivated, uninhabited, and inhospitable region.'
  },
  {
    answer: 'celebration',
    difficulty: 'hard',
    category: 'Noun • Objects & Daily Life',
    definition: 'The action of marking one’s pleasure at an important event or occasion.'
  },
  {
    answer: 'constellation',
    difficulty: 'hard',
    category: 'Noun • Space & Astronomy',
    definition: 'A group of stars forming a recognizable pattern that is traditionally named.'
  },
  {
    answer: 'architecture',
    difficulty: 'hard',
    category: 'Noun • Art & Culture',
    definition: 'The art or practice of designing and constructing buildings.'
  },
  {
    answer: 'kaleidoscope',
    difficulty: 'hard',
    category: 'Noun • Art & Culture',
    definition: 'A constantly changing pattern or sequence of elements.'
  },
  {
    answer: 'metamorphosis',
    difficulty: 'hard',
    category: 'Noun • Science & Discovery',
    definition: 'A change of the form or nature of a thing or person into a completely different one.'
  },
  {
    answer: 'renaissance',
    difficulty: 'hard',
    category: 'Noun • Art & Culture',
    definition: 'A revival of or renewed interest in something, especially culture and learning.'
  },
  {
    answer: 'phenomenon',
    difficulty: 'hard',
    category: 'Noun • Science & Discovery',
    definition: 'A fact or situation that is observed to exist or happen, especially one whose cause is in question.'
  }
];

// Active in-memory state
let nextWordId = 1;
const activeWordsMap = new Map();
const usedWordsSet = new Set();
const isReplenishing = { easy: false, medium: false, hard: false };

// Word pools organized by difficulty
const wordPools = {
  easy: [],
  medium: [],
  hard: []
};

// Initialize seed words into pools
function initializePools() {
  for (const item of SEED_WORDS) {
    usedWordsSet.add(item.answer.toLowerCase());
    wordPools[item.difficulty].push({
      ...item,
      source: 'seed_dictionary'
    });
  }
}
initializePools();

/**
 * Replenish pool for a given difficulty from the Dictionary API in the background
 */
async function replenishPool(difficulty) {
  if (isReplenishing[difficulty]) return;
  isReplenishing[difficulty] = true;

  try {
    const fetchedWords = await fetchWordsFromDictionaryApi(difficulty, 15);
    for (const w of fetchedWords) {
      if (!usedWordsSet.has(w.answer)) {
        usedWordsSet.add(w.answer);
        wordPools[difficulty].push(w);
      }
    }
  } catch (err) {
    console.error(`Error replenishing ${difficulty} pool:`, err.message);
  } finally {
    isReplenishing[difficulty] = false;
  }
}

// Kick off initial background pool expansion on startup
(async () => {
  await Promise.allSettled([
    replenishPool('easy'),
    replenishPool('medium'),
    replenishPool('hard')
  ]);
})();

/**
 * Get a random jumbled word from the Dictionary API pool
 */
export async function getRandomWord(difficulty = null) {
  let targetDiff = (difficulty || '').toLowerCase();
  if (targetDiff === 'random' || !['easy', 'medium', 'hard'].includes(targetDiff)) {
    const diffs = ['easy', 'medium', 'hard'];
    targetDiff = diffs[Math.floor(Math.random() * diffs.length)];
  }

  let pool = wordPools[targetDiff];

  // If pool is getting low, replenish asynchronously
  if (pool.length < 8) {
    replenishPool(targetDiff);
  }

  // If pool is empty, fall back to seed words for that difficulty
  if (!pool || pool.length === 0) {
    const fallbacks = SEED_WORDS.filter((w) => w.difficulty === targetDiff);
    pool = fallbacks.length > 0 ? fallbacks : SEED_WORDS;
  }

  // Pick a random word from the pool
  const randomIndex = Math.floor(Math.random() * pool.length);
  const selected = pool[randomIndex];

  // Remove from active pool to avoid quick repeats
  if (pool.length > 5) {
    pool.splice(randomIndex, 1);
  }

  // Generate dynamic jumbled anagram
  const jumbled = jumbleWord(selected.answer);

  // Assign a unique ID for this gameplay round
  const currentId = nextWordId++;

  const wordEntry = {
    id: currentId,
    answer: selected.answer.toLowerCase(),
    jumbled,
    difficulty: selected.difficulty,
    category: selected.category,
    definition: selected.definition,
    partOfSpeech: selected.partOfSpeech
  };

  activeWordsMap.set(currentId, wordEntry);

  // Asynchronously enrich definition with Free Dictionary API if available
  fetchFromFreeDictionary(wordEntry.answer).then((rich) => {
    if (rich && activeWordsMap.has(currentId)) {
      const existing = activeWordsMap.get(currentId);
      existing.definition = rich.definition || existing.definition;
      if (rich.partOfSpeech) {
        existing.partOfSpeech = rich.partOfSpeech;
        const topicPart = existing.category?.split('•')?.[1]?.trim() || 'General';
        existing.category = `${rich.partOfSpeech} • ${topicPart}`;
      }
    }
  });

  return {
    id: wordEntry.id,
    jumbled: wordEntry.jumbled,
    difficulty: wordEntry.difficulty,
    answer: wordEntry.answer
  };
}

/**
 * Check a user's submitted answer
 */
export function checkAnswer(id, submittedAnswer) {
  const numericId = parseInt(id, 10);
  const word = activeWordsMap.get(numericId);

  if (!word) {
    return { found: false, correct: false };
  }

  const cleanInput = (submittedAnswer || '').trim().toLowerCase();
  const isCorrect = cleanInput === word.answer.toLowerCase();

  return {
    found: true,
    correct: isCorrect,
    id: word.id
  };
}

/**
 * Reveal the answer for a word by ID
 */
export function getWordAnswer(id) {
  const numericId = parseInt(id, 10);
  const word = activeWordsMap.get(numericId);
  return word ? word.answer : null;
}

/**
 * Get hint (category, definition, first-letter) for a word
 */
export async function getWordHint(id, hintType) {
  const numericId = parseInt(id, 10);
  const word = activeWordsMap.get(numericId);
  if (!word) return null;

  switch (hintType) {
    case 'category':
      return {
        type: 'category',
        hint: word.category || `${word.partOfSpeech || 'General'} Vocabulary`
      };
    case 'definition':
      return {
        type: 'definition',
        hint: word.definition || 'A common English vocabulary word.'
      };
    case 'first-letter':
      return {
        type: 'first-letter',
        hint: word.answer.charAt(0).toUpperCase()
      };
    default:
      return null;
  }
}

/**
 * Export WORDS array for backwards compatibility and stats endpoint
 */
export const WORDS = SEED_WORDS;
