// Word dataset initialized from the original game
export const WORDS = [
  { id: 1, jumbled: "epiertl", answer: "reptile" },
  { id: 2, jumbled: "foprerm", answer: "perform" },
  { id: 3, jumbled: "ocnialtoi", answer: "coalition" },
  { id: 4, jumbled: "uaqrtre", answer: "quarter" },
  { id: 5, jumbled: "nesreu", answer: "ensure" },
  { id: 6, jumbled: "soehu", answer: "house" },
  { id: 7, jumbled: "iavreelt", answer: "relative" },
  { id: 8, jumbled: "erogast", answer: "storage" },
  { id: 9, jumbled: "txmneeipo", answer: "exemption" },
  { id: 10, jumbled: "rphees", answer: "sphere" },
  { id: 11, jumbled: "nlskteoe", answer: "skeleton" },
  { id: 12, jumbled: "miailunum", answer: "aluminum", altAnswers: ["aluminium"] },
  { id: 13, jumbled: "nrbkeo", answer: "broken" },
  { id: 14, jumbled: "ntnatiriso", answer: "transition" },
  { id: 15, jumbled: "reetporr", answer: "reporter" },
  { id: 16, jumbled: "sitecrde", answer: "discreet" },
  { id: 17, jumbled: "evisiced", answer: "decisive" },
  { id: 18, jumbled: "arselee", answer: "release" },
  { id: 19, jumbled: "htrates", answer: "threats" },
  { id: 20, jumbled: "deispes", answer: "despise" },
  { id: 21, jumbled: "tehrnc", answer: "trench" },
  { id: 22, jumbled: "ocinsu", answer: "cousin" },
  { id: 23, jumbled: "eurndinem", answer: "undermine" },
  { id: 24, jumbled: "eprecsne", answer: "presence" },
  { id: 25, jumbled: "iqntau", answer: "quaint" }
];

export function getRandomWord() {
  const randomIndex = Math.floor(Math.random() * WORDS.length);
  const word = WORDS[randomIndex];
  return {
    id: word.id,
    jumbled: word.jumbled
  };
}

export function checkAnswer(id, submittedAnswer) {
  const word = WORDS.find((w) => w.id === parseInt(id, 10));
  if (!word) {
    return { found: false, correct: false };
  }

  const cleanInput = submittedAnswer.trim().toLowerCase();
  const matchesAnswer = cleanInput === word.answer.toLowerCase();
  const matchesAlt = Boolean(word.altAnswers && word.altAnswers.some((alt) => alt.toLowerCase() === cleanInput));
  const isCorrect = matchesAnswer || matchesAlt;

  return {
    found: true,
    correct: isCorrect,
    id: word.id
  };
}

export function getWordAnswer(id) {
  const word = WORDS.find((w) => w.id === parseInt(id, 10));
  return word ? word.answer : null;
}
