import "dotenv/config";
import { getRPSChoices } from "./game.js";
import { capitalize, InstallGlobalCommands } from "./utils.js";
import process from "node:process";

// Get the game choices from game.js
function createCommandChoices() {
  const choices = getRPSChoices();
  const commandChoices = [];
  for (let choice of choices) {
    commandChoices.push({
      name: capitalize(choice),
      value: choice.toLowerCase(),
    });
  }
  return commandChoices;
}

const TEST_COMMAND = {
  name: "test",
  description: "Basic command",
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const CHALLENGE_COMMAND = {
  name: "challenge",
  description: "Challenge to a match of rock paper scissors",
  options: [
    {
      type: 3,
      name: "object",
      description: "Pick your object",
      required: true,
      choices: createCommandChoices(),
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 2],
};

const BLACKJACK_COMMAND = {
  name: "blackjack",
  description: "Play a simple game of Blackjack against the dealer.",
  type: 1, // CHAT_INPUT
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const JOKE_COMMAND = {
  name: "joke",
  description: "Sends a random joke or a specific one.",
  options: [
    {
      type: 4, // INTEGER
      name: "number",
      description: "The number of the joke you want (1-3)",
      required: false,
      min_value: 1,
      max_value: 3,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const RULES_COMMAND = {
  name: "rules",
  description: "Show the bot theme, rules, and example commands",
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const TICTACTOE_COMMAND = {
  name: "tictactoe",
  description: "Start a Tic Tac Toe challenge that anyone can accept.",
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const COINFLIP_COMMAND = {
  name: "coinflip",
  description: "Flip a coin and get heads or tails!",
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const HIGHER_LOWER_COMMAND = {
  name: "higherlower",
  description: "Play a game of Higher or Lower!",
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const HANGMAN_COMMAND = {
  name: "hangman",
  description: "Play hangman with a group of people.",
  options: [
    {
      type: 4,
      name: "number",
      description: "The letter count you want to guess (min 5, max 14).",
      required: false,
      min_value: 5,
      max_value: 14,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const TYPERACE_COMMAND = {
  name: "typerace",
  description:
    "Start a typing race; host begins the race and players submit their typing.",
  options: [],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const SUBMIT_COMMAND = {
  name: "submit",
  description:
    "Submit your typed passage for the active race (or provide game id).",
  options: [
    {
      type: 3, // STRING
      name: "text",
      description: "Your typed passage (paste/type the full passage)",
      required: true,
    },
    {
      type: 3,
      name: "game",
      description: "Optional game id to submit to",
      required: false,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const ZODIAC_COMMAND = {
  name: "zodiac",
  description: "Enter your birth month and day to get a horoscope fact.",
  options: [
    {
      type: 4,
      name: "month",
      description: "Birth Month (1-12)",
      required: true,
      min_value: 1,
      max_value: 12,
    },
    {
      type: 4,
      name: "day",
      description: "Birth Day (1-31)",
      required: true,
      min_value: 1,
      max_value: 31,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const GUESS_SONG_COMMAND = {
  name: "guesssong",
  description:
    "Play Guess the Song! Choose a genre and guess the song from emojis.",
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const USAGES_COMMAND = {
  name: "usages",
  description: "View your command usage statistics as a chart",
  options: [
    {
      type: 6, // USER type
      name: "user",
      description: "View usage stats for a specific user (optional)",
      required: false,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

export const ALL_COMMANDS = [
  TEST_COMMAND,
  CHALLENGE_COMMAND,
  JOKE_COMMAND,
  RULES_COMMAND,
  COINFLIP_COMMAND,
  GUESS_SONG_COMMAND,
  HANGMAN_COMMAND,
  TYPERACE_COMMAND,
  SUBMIT_COMMAND,
  HIGHER_LOWER_COMMAND,
  ZODIAC_COMMAND,
  BLACKJACK_COMMAND,
  TICTACTOE_COMMAND,
  USAGES_COMMAND,
];

// FIX: Only register commands if this file is run directly (via npm run register)
// This prevents Rate Limits (429) when app.js imports this file.
if (process.argv[1].endsWith("commands.js")) {
  InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
}
