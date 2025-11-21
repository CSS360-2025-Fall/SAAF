import { capitalize } from './utils.js';

export function getResult(p1, p2) {
  let gameResult;
  if (RPSChoices[p1.objectName] && RPSChoices[p1.objectName][p2.objectName]) {
    // o1 wins
    gameResult = {
      win: p1,
      lose: p2,
      verb: RPSChoices[p1.objectName][p2.objectName],
    };
  } else if (
    RPSChoices[p2.objectName] &&
    RPSChoices[p2.objectName][p1.objectName]
  ) {
    // o2 wins
    gameResult = {
      win: p2,
      lose: p1,
      verb: RPSChoices[p2.objectName][p1.objectName],
    };
  } else {
    // tie -- win/lose don't
    gameResult = { win: p1, lose: p2, verb: 'tie' };
  }

  return formatResult(gameResult);
}

function formatResult(result) {
  const { win, lose, verb } = result;
  return verb === 'tie'
    ? `<@${win.id}> and <@${lose.id}> draw with **${win.objectName}**`
    : `<@${win.id}>'s **${win.objectName}** ${verb} <@${lose.id}>'s **${lose.objectName}**`;
}

// this is just to figure out winner + verb
const RPSChoices = {
  rock: {
    description: 'sedimentary, igneous, or perhaps even metamorphic',
    virus: 'outwaits',
    computer: 'smashes',
    scissors: 'crushes',
  },
  cowboy: {
    description: 'yeehaw~',
    scissors: 'puts away',
    wumpus: 'lassos',
    rock: 'steel-toe kicks',
  },
  scissors: {
    description: 'careful ! sharp ! edges !!',
    paper: 'cuts',
    computer: 'cuts cord of',
    virus: 'cuts DNA of',
  },
  virus: {
    description: 'genetic mutation, malware, or something inbetween',
    cowboy: 'infects',
    computer: 'corrupts',
    wumpus: 'infects',
  },
  computer: {
    description: 'beep boop beep bzzrrhggggg',
    cowboy: 'overwhelms',
    paper: 'uninstalls firmware for',
    wumpus: 'deletes assets for',
  },
  wumpus: {
    description: 'the purple Discord fella',
    paper: 'draws picture on',
    rock: 'paints cute face on',
    scissors: 'admires own reflection in',
  },
  paper: {
    description: 'versatile and iconic',
    virus: 'ignores',
    cowboy: 'gives papercut to',
    rock: 'covers',
  },
};

export function getRPSChoices() {
  return Object.keys(RPSChoices);
}

// Function to fetch shuffled options for select menu
export function getShuffledOptions() {
  const allChoices = getRPSChoices();
  const options = [];

  for (let c of allChoices) {
    // Formatted for select menus
    // https://discord.com/developers/docs/components/reference#string-select-select-option-structure
    options.push({
      label: capitalize(c),
      value: c.toLowerCase(),
      description: RPSChoices[c]['description'],
    });
  }

  return options.sort(() => Math.random() - 0.5);
}

// --- NEW HIGHER / LOWER GAME LOGIC ---

const SUITS = ["Hearts", "Diamonds", "Clubs", "Spades"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "Jack", "Queen", "King", "Ace"];

// Map ranks to their numerical values for comparison
const RANK_VALUES = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10,
  "Jack": 11, "Queen": 12, "King": 13, "Ace": 14
};

// Map suits to their colors
const SUIT_COLORS = {
  "Hearts": "Red", "Diamonds": "Red", "Clubs": "Black", "Spades": "Black"
};

// Map suits to emojis for a nicer display
const SUIT_EMOJIS = {
  "Hearts": "♥️", "Diamonds": "♦️", "Clubs": "♣️", "Spades": "♠️"
};

/**
 * Creates a standard 52-card deck
 */
export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

/**
 * Shuffles a deck using Fisher-Yates algorithm
 * @param {Array} deck - The deck to shuffle
 */
export function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/**
 * Gets the value, color, and display name of a card
 * @param {Object} card - The card object (e.g., { rank: "Ace", suit: "Spades" })
 */
export function getCardInfo(card) {
  if (!card) return null;
  return {
    value: RANK_VALUES[card.rank],
    color: SUIT_COLORS[card.suit],
    name: `${card.rank} of ${card.suit} ${SUIT_EMOJIS[card.suit]}`
  };
}

// --- NEW ZODIAC LOGIC ---

const ZODIAC_DATA = [
  { sign: "Capricorn", start: { m: 1, d: 1 }, end: { m: 1, d: 19 }, fact: "You are ambitious, but you repress your emotions until you explode." },
  { sign: "Aquarius", start: { m: 1, d: 20 }, end: { m: 2, d: 18 }, fact: "You are unique, but you have a god complex about being an outsider." },
  { sign: "Pisces", start: { m: 2, d: 19 }, end: { m: 3, d: 20 }, fact: "You are psychic, but you cry over commercials." },
  { sign: "Aries", start: { m: 3, d: 21 }, end: { m: 4, d: 19 }, fact: "You are bold, but you have the patience of a toddler." },
  { sign: "Taurus", start: { m: 4, d: 20 }, end: { m: 5, d: 20 }, fact: "You are reliable, but you would rather nap than save the world." },
  { sign: "Gemini", start: { m: 5, d: 21 }, end: { m: 6, d: 20 }, fact: "You are adaptable, but you have two faces and we never know which one is driving." },
  { sign: "Cancer", start: { m: 6, d: 21 }, end: { m: 7, d: 22 }, fact: "You are nurturing, but you hold grudges from 2005." },
  { sign: "Leo", start: { m: 7, d: 23 }, end: { m: 8, d: 22 }, fact: "You are charismatic, but you think the sun literally revolves around you." },
  { sign: "Virgo", start: { m: 8, d: 23 }, end: { m: 9, d: 22 }, fact: "You are organized, but you stress clean when you are avoiding your feelings." },
  { sign: "Libra", start: { m: 9, d: 23 }, end: { m: 10, d: 22 }, fact: "You are charming, but you take three hours to pick a restaurant." },
  { sign: "Scorpio", start: { m: 10, d: 23 }, end: { m: 11, d: 21 }, fact: "You are passionate, but you treat every conversation like an interrogation." },
  { sign: "Sagittarius", start: { m: 11, d: 22 }, end: { m: 12, d: 21 }, fact: "You are adventurous, but you have a fear of commitment." },
  { sign: "Capricorn", start: { m: 12, d: 22 }, end: { m: 12, d: 31 }, fact: "You are ambitious, but you repress your emotions until you explode." }
];

export function getZodiacSign(month, day) {
  // Simple validation
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  // Find the sign where the date falls between ranges
  for (const z of ZODIAC_DATA) {
    if (month === z.start.m && day >= z.start.d && (z.start.m === z.end.m ? day <= z.end.d : true)) {
      return z;
    }
    if (month === z.end.m && day <= z.end.d && (z.start.m === z.end.m ? day >= z.start.d : true)) {
      return z;
    }
  }
  return null;
}