import fs from 'fs';
import path from 'path';

// Load wordsbylength.csv into a map: length -> [words]
const WORDS_CSV = path.join(new URL(import.meta.url).pathname, '..', 'wordsbylength.csv');

function parseCSV(csv) {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const map = new Map();
  for (const line of lines) {
    // each line: length, word1, word2, ...
    const parts = line.split(',').map((s) => s.trim());
    const len = Number(parts[0]);
    const words = parts.slice(1).map((w) => w.toLowerCase());
    if (!Number.isNaN(len)) map.set(len, words);
  }
  return map;
}

let wordsByLength = new Map();
try {
  const csv = fs.readFileSync(WORDS_CSV, 'utf8');
  wordsByLength = parseCSV(csv);
} catch (err) {
  // if loading fails, keep map empty; callers should handle missing words
  console.error('hangman: failed to load wordsbylength.csv', err.message);
}

export function availableLengths() {
  return Array.from(wordsByLength.keys()).sort((a, b) => a - b);
}

export function pickWordByLength(len) {
  const list = wordsByLength.get(Number(len)) || [];
  if (list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

export function pickRandomWord() {
  const lengths = availableLengths();
  if (lengths.length === 0) return null;
  const len = lengths[Math.floor(Math.random() * lengths.length)];
  return pickWordByLength(len);
}

export function maskWord(word, guessedLetters = []) {
  const set = new Set(guessedLetters.map((c) => String(c).toLowerCase()));
  let revealed = '';
  for (const ch of word) {
    if (ch === ' ' || ch === '-' || set.has(ch)) revealed += ch;
    else revealed += '_';
  }
  return revealed.split('').join(' ');
}

export function wordContainsLetter(word, letter) {
  return word.includes(String(letter).toLowerCase());
}
