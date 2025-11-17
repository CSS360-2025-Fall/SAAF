import "dotenv/config";
import { getRPSChoices } from "./game.js";
import { capitalize, InstallGlobalCommands } from "./utils.js";
import { process } from "node:process";

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

// Simple test command (Syntax corrected)
const TEST_COMMAND = {
  name: "test",
  description: "Basic command",
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

// Command containing options (Syntax corrected)
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

// --- JOKE COMMAND DEFINITION ADDED HERE ---
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
  integration_types: [0, 1], // Can be used in guilds and DMs
  contexts: [0, 1, 2], // Can be used in guilds, DMs, and other contexts
};
// --- END OF ADDED CODE ---

const RULES_COMMAND = {
  name: "rules",
  description: "Show the bot theme, rules, and example commands",
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

export const ALL_COMMANDS = [
  TEST_COMMAND,
  CHALLENGE_COMMAND,
  JOKE_COMMAND,
  RULES_COMMAND,
];
InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
