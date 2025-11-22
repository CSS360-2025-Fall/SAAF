// Simple TypeRace helper: small sentence pool and utilities
export const SENTENCES = [
  "The quick brown fox jumps over the lazy dog.",
  "Pack my box with five dozen liquor jugs.",
  "Sphinx of black quartz, judge my vow.",
  "How vexingly quick daft zebras jump.",
  "Bright vixens jump; dozy fowl quack.",
  "Two driven jocks help fax my big quiz.",
  "Crazy Fredrick bought many very exquisite opal jewels.",
  "We promptly judged antique ivory buckles for the next prize.",
  "Amazingly few discotheques provide jukeboxes.",
  "Just keep examining every low bid quoted for zinc etchings.",
];

export function pickPassage() {
  return SENTENCES[Math.floor(Math.random() * SENTENCES.length)];
}

// Levenshtein distance
export function levenshtein(a, b) {
  const n = a.length;
  const m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[n][m];
}

export function computeStats(target, typed, elapsedMs) {
  const trimmedTarget = String(target || "").trim();
  const trimmedTyped = String(typed || "").trim();
  const distance = levenshtein(trimmedTarget, trimmedTyped);
  const maxLen = Math.max(trimmedTarget.length, 1);
  const correctChars = Math.max(0, trimmedTarget.length - distance);
  const accuracy = correctChars / maxLen; // 0..1

  const minutes = Math.max(elapsedMs / 60000, 0.0001);
  const grossWPM = trimmedTyped.length / 5 / minutes;
  const netWPM = grossWPM * accuracy;

  return {
    distance,
    correctChars,
    accuracy,
    grossWPM: Math.round(grossWPM * 10) / 10,
    netWPM: Math.round(netWPM * 10) / 10,
    elapsedMs,
  };
}
