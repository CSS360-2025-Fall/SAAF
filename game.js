import { capitalize } from "./utils.js";
import fs from "fs";
import path from "path";

// --- ROCK PAPER SCISSORS LOGIC ---
export function getResult(p1, p2) {
  let gameResult;
  if (RPSChoices[p1.objectName] && RPSChoices[p1.objectName][p2.objectName]) {
    gameResult = {
      win: p1,
      lose: p2,
      verb: RPSChoices[p1.objectName][p2.objectName],
    };
  } else if (
    RPSChoices[p2.objectName] &&
    RPSChoices[p2.objectName][p1.objectName]
  ) {
    gameResult = {
      win: p2,
      lose: p1,
      verb: RPSChoices[p2.objectName][p1.objectName],
    };
  } else {
    gameResult = { win: p1, lose: p2, verb: "tie" };
  }
  return formatResult(gameResult);
}

function formatResult(result) {
  const { win, lose, verb } = result;
  return verb === "tie"
    ? `<@${win.id}> and <@${lose.id}> draw with **${win.objectName}**`
    : `<@${win.id}>'s **${win.objectName}** ${verb} <@${lose.id}>'s **${lose.objectName}**`;
}

const RPSChoices = {
  rock: {
    description: "sedimentary, igneous, or perhaps even metamorphic",
    virus: "outwaits",
    computer: "smashes",
    scissors: "crushes",
  },
  cowboy: {
    description: "yeehaw~",
    scissors: "puts away",
    wumpus: "lassos",
    rock: "steel-toe kicks",
  },
  scissors: {
    description: "careful ! sharp ! edges !!",
    paper: "cuts",
    computer: "cuts cord of",
    virus: "cuts DNA of",
  },
  virus: {
    description: "genetic mutation, malware, or something inbetween",
    cowboy: "infects",
    computer: "corrupts",
    wumpus: "infects",
  },
  computer: {
    description: "beep boop beep bzzrrhggggg",
    cowboy: "overwhelms",
    paper: "uninstalls firmware for",
    wumpus: "deletes assets for",
  },
  wumpus: {
    description: "the purple Discord fella",
    paper: "draws picture on",
    rock: "paints cute face on",
    scissors: "admires own reflection in",
  },
  paper: {
    description: "versatile and iconic",
    virus: "ignores",
    cowboy: "gives papercut to",
    rock: "covers",
  },
};

export function getRPSChoices() {
  return Object.keys(RPSChoices);
}

export function getShuffledOptions() {
  const allChoices = getRPSChoices();
  const options = [];
  for (let c of allChoices) {
    options.push({
      label: capitalize(c),
      value: c.toLowerCase(),
      description: RPSChoices[c]["description"],
    });
  }
  return options.sort(() => Math.random() - 0.5);
}

// --- HIGHER / LOWER GAME LOGIC ---
const SUITS = ["Hearts", "Diamonds", "Clubs", "Spades"];
const RANKS = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "Jack",
  "Queen",
  "King",
  "Ace",
];
const RANK_VALUES = {
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  10: 10,
  Jack: 11,
  Queen: 12,
  King: 13,
  Ace: 14,
};
const SUIT_COLORS = {
  Hearts: "Red",
  Diamonds: "Red",
  Clubs: "Black",
  Spades: "Black",
};
const SUIT_EMOJIS = {
  Hearts: "♥️",
  Diamonds: "♦️",
  Clubs: "♣️",
  Spades: "♠️",
};

export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

export function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function getCardInfo(card) {
  if (!card) return null;
  return {
    value: RANK_VALUES[card.rank],
    color: SUIT_COLORS[card.suit],
    name: `${card.rank} of ${card.suit} ${SUIT_EMOJIS[card.suit]}`,
  };
}

// --- ZODIAC LOGIC ---
const ZODIAC_DATA = [
  {
    sign: "Capricorn",
    start: { m: 1, d: 1 },
    end: { m: 1, d: 19 },
    facts: [
      "You are ambitious, but you repress your emotions until you explode.",
      "Ruled by Saturn, you are the master of discipline and responsibility.",
      "You have a 'CEO energy'—always planning five steps ahead.",
      "You often age in reverse: serious as a child, but more playful as you get older.",
      "You value tradition and craftsmanship over fleeting trends.",
      "Your love language is acts of service; you show care by fixing things.",
      "You are an Earth sign, making you practical, grounded, and sometimes stubborn.",
      "You struggle to ask for help because you think you can do it better yourself.",
      "You have a dry, sarcastic sense of humor that catches people off guard.",
      "Success is your biggest aphrodisiac.",
    ],
  },
  {
    sign: "Aquarius",
    start: { m: 1, d: 20 },
    end: { m: 2, d: 18 },
    facts: [
      "You are unique, but you have a god complex about being an outsider.",
      "Ruled by Uranus, you are the disruptor and innovator of the zodiac.",
      "You love humanity as a whole, but often find individuals annoying.",
      "You are an Air sign, meaning you live in your head and love intellectual debates.",
      "You often ghost people accidentally because you got lost in a Wikipedia rabbit hole.",
      "You hate being told what to do and will rebel just to prove a point.",
      "You are known for having an eccentric fashion sense or unconventional hobbies.",
      "Emotions confuse you; you prefer to analyze feelings rather than feel them.",
      "You are the 'alien' of the zodiac—always looking at the future.",
      "You value freedom above all else in relationships.",
    ],
  },
  {
    sign: "Pisces",
    start: { m: 2, d: 19 },
    end: { m: 3, d: 20 },
    facts: [
      "You are psychic, but you cry over commercials.",
      "Ruled by Neptune, you live in a dream world of your own making.",
      "You are a Water sign, making you deeply empathetic and emotionally porous.",
      "You often absorb other people's moods like a sponge.",
      "You are the old soul of the zodiac, carrying the wisdom of all previous signs.",
      "You have a tendency to play the martyr or victim when things go wrong.",
      "You are incredibly creative and artistic, often using art as an escape.",
      "Boundaries are hard for you; you want to merge souls with everyone.",
      "You are a natural romantic who falls in love with the *idea* of people.",
      "Your intuition is almost never wrong, even if you ignore it.",
    ],
  },
  {
    sign: "Aries",
    start: { m: 3, d: 21 },
    end: { m: 4, d: 19 },
    facts: [
      "You are bold, but you have the patience of a toddler.",
      "Ruled by Mars, you are the warrior of the zodiac—impulsive and fiery.",
      "You are a Fire sign, meaning you act first and think later.",
      "You view everything as a competition, even things that definitely aren't.",
      "You are brutally honest; you don't have a filter.",
      "You get over anger as quickly as you get into it.",
      "You are a natural leader who prefers to blaze new trails than follow others.",
      "Boredom is your worst enemy.",
      "You love the chase more than the catch in relationships.",
      "You are fiercely independent and hate feeling tied down.",
    ],
  },
  {
    sign: "Taurus",
    start: { m: 4, d: 20 },
    end: { m: 5, d: 20 },
    facts: [
      "You are reliable, but you would rather nap than save the world.",
      "Ruled by Venus, you are the sensualist of the zodiac, loving luxury and comfort.",
      "You are an Earth sign, making you grounded, practical, and extremely stubborn.",
      "You don't like change; you prefer a steady, predictable routine.",
      "You are a foodie at heart and can be won over with a good meal.",
      "You are incredibly loyal, but once someone loses your trust, it's gone forever.",
      "You have a long fuse, but your anger is terrifying when it finally explodes.",
      "You work hard so you can afford to be lazy in high-thread-count sheets.",
      "You are possessive of your things and your people.",
      "You take your time making decisions, but you stick to them for life.",
    ],
  },
  {
    sign: "Gemini",
    start: { m: 5, d: 21 },
    end: { m: 6, d: 20 },
    facts: [
      "You are adaptable, but you have two faces and we never know which one is driving.",
      "Ruled by Mercury, you are the messenger—witty, chatty, and curious.",
      "You are an Air sign, so you need constant mental stimulation.",
      "You know a little bit about everything but are rarely an expert in one thing.",
      "You are the social butterfly who can talk to a brick wall.",
      "You change your mind (and your mood) every five minutes.",
      "You are terrified of boredom and being alone with your thoughts.",
      "You love gossip, even if you claim you don't.",
      "You are a master of multitasking but struggle to finish what you start.",
      "You are naturally flirtatious and love the game of communication.",
    ],
  },
  {
    sign: "Cancer",
    start: { m: 6, d: 21 },
    end: { m: 7, d: 22 },
    facts: [
      "You are nurturing, but you hold grudges from 2005.",
      "Ruled by the Moon, your moods change as quickly as the tides.",
      "You are a Water sign, deeply intuitive, protective, and emotional.",
      "You have a hard outer shell, but you are soft and mushy on the inside.",
      "Home is your sanctuary; you are the ultimate nester.",
      "You are passive-aggressive when you are hurt instead of being direct.",
      "You have an incredible memory, especially for emotional events.",
      "You collect people and things, finding it hard to let go.",
      "You are the 'mom' friend who makes sure everyone has eaten.",
      "You retreat into your shell when you feel threatened or overwhelmed.",
    ],
  },
  {
    sign: "Leo",
    start: { m: 7, d: 23 },
    end: { m: 8, d: 22 },
    facts: [
      "You are charismatic, but you think the sun literally revolves around you.",
      "Ruled by the Sun, you are warm, radiant, and love the spotlight.",
      "You are a Fire sign, driven by passion, creativity, and ego.",
      "You are incredibly generous, often giving the best gifts.",
      "You require constant praise and validation to function.",
      "You are dramatic and treat life like a movie where you are the main character.",
      "Loyalty is huge for you; you will defend your friends to the death.",
      "You have a fragile ego despite your confident exterior.",
      "You are a natural born leader who expects to be followed.",
      "Your hair is often your best feature (the lion's mane).",
    ],
  },
  {
    sign: "Virgo",
    start: { m: 8, d: 23 },
    end: { m: 9, d: 22 },
    facts: [
      "You are organized, but you stress clean when you are avoiding your feelings.",
      "Ruled by Mercury, you are analytical, detailed, and a perfectionist.",
      "You are an Earth sign, focused on being useful and productive.",
      "You show love by criticizing people to help them 'improve'.",
      "You notice details that everyone else misses.",
      "You are a hypochondriac who WebMDs every symptom.",
      "You have a 'fixer' mentality and often attract people who need saving.",
      "You are incredibly hard on yourself and suffer from imposter syndrome.",
      "You need to feel needed.",
      "Your desk is either perfectly organized or a chaotic pile that only you understand.",
    ],
  },
  {
    sign: "Libra",
    start: { m: 9, d: 23 },
    end: { m: 10, d: 22 },
    facts: [
      "You are charming, but you take three hours to pick a restaurant.",
      "Ruled by Venus, you are obsessed with aesthetics, beauty, and romance.",
      "You are an Air sign, prioritizing social harmony and intellect.",
      "You play devil's advocate just to see both sides of an argument.",
      "You hate conflict and will lie just to keep the peace.",
      "You are a massive flirt, sometimes without even realizing it.",
      "You can't be alone; you always need a partner or a best friend nearby.",
      "You struggle with decision paralysis because you want the 'best' option.",
      "You have a strong sense of justice and fairness.",
      "You can be superficial, judging books by their covers.",
    ],
  },
  {
    sign: "Scorpio",
    start: { m: 10, d: 23 },
    end: { m: 11, d: 21 },
    facts: [
      "You are passionate, but you treat every conversation like an interrogation.",
      "Ruled by Pluto (and Mars), you are intense, transformative, and secretive.",
      "You are a Water sign, but you are a fixed, frozen ice-block of emotion.",
      "Trust is everything; if someone betrays you, they are dead to you.",
      "You are obsessed with the darker side of life—death, taboos, and mysteries.",
      "You have a magnetic, hypnotic stare that makes people uncomfortable.",
      "You are incredibly private and hide your true feelings behind a mask.",
      "You are a master of reinvention, rising from the ashes like a phoenix.",
      "You can be possessive and jealous in relationships.",
      "You don't do small talk; you want to know someone's deepest trauma immediately.",
    ],
  },
  {
    sign: "Sagittarius",
    start: { m: 11, d: 22 },
    end: { m: 12, d: 21 },
    facts: [
      "You are adventurous, but you have a fear of commitment.",
      "Ruled by Jupiter, you are the lucky optimist of the zodiac.",
      "You are a Fire sign, seeking freedom, expansion, and truth.",
      "You have no filter and often suffer from 'foot-in-mouth' disease.",
      "You love travel and philosophy; you are a lifelong student of the world.",
      "You are allergic to clingy people and routine.",
      "You use humor as a defense mechanism to avoid serious emotions.",
      "You are prone to exaggeration when telling stories.",
      "You are the friend who is always down for a spontaneous road trip.",
      "You promise more than you can deliver because you are overly optimistic.",
    ],
  },
  {
    sign: "Capricorn",
    start: { m: 12, d: 22 },
    end: { m: 12, d: 31 },
    facts: [
      "You are ambitious, but you repress your emotions until you explode.",
      "Ruled by Saturn, you are the master of discipline and responsibility.",
      "You have a 'CEO energy'—always planning five steps ahead.",
      "You often age in reverse: serious as a child, but more playful as you get older.",
      "You value tradition and craftsmanship over fleeting trends.",
      "Your love language is acts of service; you show care by fixing things.",
      "You are an Earth sign, making you practical, grounded, and sometimes stubborn.",
      "You struggle to ask for help because you think you can do it better yourself.",
      "You have a dry, sarcastic sense of humor that catches people off guard.",
      "Success is your biggest aphrodisiac.",
    ],
  },
];

export function getZodiacSign(month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  for (const z of ZODIAC_DATA) {
    if (
      month === z.start.m &&
      day >= z.start.d &&
      (z.start.m === z.end.m ? day <= z.end.d : true)
    )
      return z;
    if (
      month === z.end.m &&
      day <= z.end.d &&
      (z.start.m === z.end.m ? day >= z.start.d : true)
    )
      return z;
  }
  return null;
}

const WORDS_CSV = path.join(
  new URL(import.meta.url).pathname,
  "..",
  "hangman",
  "wordsbylength.csv"
);

function parseCSV(csv) {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const map = new Map();
  for (const line of lines) {
    // each line: length, word1, word2, ...
    const parts = line.split(",").map((s) => s.trim());
    const len = Number(parts[0]);
    const words = parts.slice(1).map((w) => w.toLowerCase());
    if (!Number.isNaN(len)) map.set(len, words);
  }
  console.log(map);
  return map;
}

let wordsByLength = new Map();
try {
  const csv = fs.readFileSync(WORDS_CSV, "utf8");
  wordsByLength = parseCSV(csv);
} catch (err) {
  // if loading fails, keep map empty; callers should handle missing words
  console.error("hangman: failed to load wordsbylength.csv", err.message);
}

export function availableLengths() {
  return Array.from(wordsByLength.keys()).sort((a, b) => a - b);
}

export function pickRandomWord() {
  const lengths = availableLengths();
  if (lengths.length === 0) return null;
  const len = lengths[Math.floor(Math.random() * lengths.length)];
  return pickWordByLength(len);
}

export function pickWordByLength(len) {
  const list = wordsByLength.get(Number(len)) || [];
  if (list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

export function maskWord(word, guessedLetters) {
  return word
    .split("")
    .map((char) => (guessedLetters.includes(char) ? char : "_"))
    .join(" ");
}

export function wordContainsLetter(word, letter) {
  return word.includes(String(letter).toLowerCase());
}
