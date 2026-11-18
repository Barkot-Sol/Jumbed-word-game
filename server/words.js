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

const META_DEFINITION_REGEX =
  /^(plural|singular|past tense|past participle|present participle|third-person|comparative|superlative|alternative spelling|alternative form|obsolete form|archaic form|inflection|gerund|diminutive|feminine|masculine|variant|contraction|abbreviation)\b/i;

const COMMON_SUFFIXES = [
  'iness', 'ation', 'ition', 'ative', 'itive', 'ical', 'ious', 'ment', 'ness',
  'tion', 'sion', 'ance', 'ence', 'ancy', 'ency', 'able', 'ible', 'ship',
  'hood', 'ward', 'ling', 'less', 'uity', 'ers', 'ies', 'ied', 'ier', 'iest',
  'ing', 'est', 'ous', 'ful', 'ial', 'ive', 'ize', 'ise', 'ist', 'ism',
  'ity', 'ion', 'ant', 'ent', 'ure', 'age', 'ary', 'ory', 'ed', 'er', 'es',
  'ly', 'al', 'ic', 's'
];

const INFLECTION_TAILS = new Set([
  's', 'es', 'ed', 'd', 'ing', 'er', 'ers', 'est', 'ly', 'ness', 'ment',
  'ion', 'tion', 'ation', 'ition', 'sion', 'ance', 'ence', 'ancy', 'ency',
  'ant', 'ent', 'ure', 'age', 'al', 'ial', 'ic', 'ical', 'ous', 'ious',
  'uous', 'ful', 'less', 'able', 'ible', 'ity', 'uity', 'ive', 'ative',
  'itive', 'ize', 'ise', 'ist', 'ism', 'y', 'ry', 'ary', 'ory', 'ship',
  'hood', 'ward', 'like', 'work', 'land', 'man', 'men', 'maker', 'holder'
]);

/**
 * Extract morphological stems and root variants of the target word
 */
function buildWordStems(word) {
  const w = (word || '').toLowerCase().trim();
  const stems = new Set([w]);
  if (w.length < 4) return stems;

  for (const suffix of COMMON_SUFFIXES) {
    if (w.endsWith(suffix)) {
      const base = w.slice(0, -suffix.length);
      if (suffix === 'iness' || suffix === 'ies' || suffix === 'ied' || suffix === 'ier' || suffix === 'iest') {
        if (base.length >= 3) {
          stems.add(base + 'y');
        }
      }
      if (base.length >= 4) {
        stems.add(base);
        stems.add(base + 'e');
        if (base.length >= 5 && base[base.length - 1] === base[base.length - 2]) {
          stems.add(base.slice(0, -1));
        }
      } else if (base.length === 3 && ['ing', 'ed', 'er', 'ers', 'est'].includes(suffix)) {
        if (base[base.length - 1] === base[base.length - 2]) {
          // e.g. 'running' -> 'runn' (len 4 handled above), 'swimming' -> 'swimm' (len 5 handled above)
          stems.add(base.slice(0, -1));
        }
      }
    }
  }

  // Handle doubled consonants producing 4-char stems like 'runn' -> 'run'
  for (const s of [...stems]) {
    if (s.length >= 4 && s[s.length - 1] === s[s.length - 2] && /[bcdfghjklmnpqrstvwxz]/.test(s[s.length - 1])) {
      const deduped = s.slice(0, -1);
      if (deduped.length >= 3) {
        stems.add(deduped);
      }
    }
  }

  return stems;
}

/**
 * Check if a single alphabetic token in a definition reveals the target word
 */
function isOffendingToken(rawToken, word, stems) {
  const token = rawToken.toLowerCase();
  const w = word.toLowerCase();
  if (!token || token.length < 3) return false;

  // Exact match against word or any derived stem
  if (token === w || stems.has(token)) {
    return true;
  }

  // Token starts with the full target word (e.g. 'apples', 'household', 'tigers')
  if (token.startsWith(w)) {
    const tail = token.slice(w.length);
    if (w.length >= 5 || INFLECTION_TAILS.has(tail)) {
      return true;
    }
  }

  // Token contains a long target word as substring (e.g. 'unbroken', 'subbridge')
  if (w.length >= 5 && token.includes(w)) {
    return true;
  }

  // Token is an inflection/derivative of one of the target word's stems (length >= 4)
  for (const stem of stems) {
    if (stem.length >= 4 && token.startsWith(stem)) {
      const tail = token.slice(stem.length);
      if (tail === '' || INFLECTION_TAILS.has(tail)) {
        return true;
      }
    }
  }

  // Closed compound check: token (>=4 chars) is a clean prefix or suffix of a longer word (>=8 chars)
  if (token.length >= 4 && w.length - token.length >= 4) {
    if (w.startsWith(token) || w.endsWith(token)) {
      return true;
    }
  }

  return false;
}

/**
 * Check whether a definition leaks/mentions the target word (or its root/inflections)
 */
export function definitionMentionsWord(definition, word) {
  if (!definition || !word) return false;
  const trimmed = definition.trim();
  if (!trimmed) return false;

  // Reject meta/inflection definitions like "Plural of ...", "Past tense of ..."
  if (META_DEFINITION_REGEX.test(trimmed)) {
    return true;
  }

  const stems = buildWordStems(word);
  const tokens = trimmed.match(/[a-zA-Z]+/g) || [];
  for (const token of tokens) {
    if (isOffendingToken(token, word, stems)) {
      return true;
    }
  }

  return false;
}

/**
 * Safeguard sanitizer: redacts any occurrence of the target word or its stem in a definition
 */
export function sanitizeDefinition(definition, word) {
  if (!definition || !word) return definition || '';
  const stems = buildWordStems(word);
  return definition.replace(/[a-zA-Z]+/g, (token) => {
    if (isOffendingToken(token, word, stems)) {
      return '_____';
    }
    return token;
  });
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
 * Scans all meanings and definitions to select one that never mentions the target word.
 */
async function fetchFromFreeDictionary(word) {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, {
      headers: { 'User-Agent': 'JumbleWordGame/2.0' },
      signal: AbortSignal.timeout(2500)
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        for (const entry of data) {
          for (const meaning of entry?.meanings || []) {
            const pos = meaning?.partOfSpeech;
            for (const defObj of meaning?.definitions || []) {
              const def = defObj?.definition;
              if (!def) continue;

              let cleanDef = def.trim();
              if (cleanDef.length > 0) {
                cleanDef = cleanDef.charAt(0).toUpperCase() + cleanDef.slice(1);
                if (!cleanDef.endsWith('.') && !cleanDef.endsWith('!') && !cleanDef.endsWith('?')) {
                  cleanDef += '.';
                }
              }

              // Only accept definitions that do NOT mention the target word or its stem
              if (cleanDef && !definitionMentionsWord(cleanDef, word)) {
                return {
                  definition: cleanDef,
                  partOfSpeech: pos ? pos.charAt(0).toUpperCase() + pos.slice(1) : 'General'
                };
              }
            }
          }
        }
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

  const url = `https://api.datamuse.com/words?topics=${topicObj.topic}&sp=${pattern}&md=dp&max=${count * 4}`;

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

      // Scan all returned definitions and pick the first one that does not mention the word itself
      let chosenParsed = null;
      for (const rawDef of item.defs) {
        const parsed = parseDatamuseDef(rawDef);
        if (parsed.definition && !definitionMentionsWord(parsed.definition, word)) {
          chosenParsed = parsed;
          break;
        }
      }

      if (!chosenParsed) continue;

      results.push({
        answer: word,
        difficulty,
        category: `${chosenParsed.partOfSpeech} • ${topicObj.label}`,
        definition: chosenParsed.definition,
        partOfSpeech: chosenParsed.partOfSpeech,
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
    definition: 'Untamed animals and vegetation living in a natural, undomesticated state.'
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

  // Asynchronously enrich definition with Free Dictionary API if available (only if clean)
  fetchFromFreeDictionary(wordEntry.answer).then((rich) => {
    if (rich && activeWordsMap.has(currentId)) {
      const existing = activeWordsMap.get(currentId);
      if (rich.definition && !definitionMentionsWord(rich.definition, existing.answer)) {
        existing.definition = rich.definition;
      }
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
    case 'definition': {
      const rawDef = word.definition || 'A common English vocabulary word.';
      const safeDef = definitionMentionsWord(rawDef, word.answer)
        ? sanitizeDefinition(rawDef, word.answer)
        : rawDef;
      return {
        type: 'definition',
        hint: safeDef
      };
    }
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
