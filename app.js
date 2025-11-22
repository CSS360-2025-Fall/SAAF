import "dotenv/config";
import express from "express";
import {
  ButtonStyleTypes,
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  MessageComponentTypes,
  verifyKeyMiddleware,
} from "discord-interactions";
import { getRandomEmoji, DiscordRequest } from "./utils.js";
import { getShuffledOptions, getResult } from "./game.js";
import { incrementCommandUsage } from "./db/commandUsage.js";
import { ALL_COMMANDS } from "./commands.js";
import {
  pickWordByLength,
  pickRandomWord,
  maskWord,
} from "./hangman/hangman.js";
import process from "node:process";

const winLoss = Object.create(null);
// Create an express app
const app = express();
// Get port, or default to 3000
const PORT = process.env.PORT || 3000;
// To keep track of our active games
const activeGames = {};
// Hangman games stored separately
const activeHangmanGames = {};
// TypeRace games
const activeTypeRaces = {};

// -------------------------
// Bot theme and rules
// -------------------------
const BOT_THEME = {
  description:
    "A fun Discord bot to play quick games like Rock Paper Scissors with friends!",
  rules: [
    "Be respectful to other players.",
    "No spamming buttons or options.",
    "Only use commands in the proper channels.",
    "Have fun and enjoy random surprises 😄",
    "The bot is meant for casual gaming; results are just for fun!",
  ],
  exampleCommands: [
    "/test - Test the bot's response",
    "/challenge <choice> - Start a Rock Paper Scissors game with a friend",
  ],
};

// --- CODE ADDED ---
// Simple array of jokes for the /joke command
const jokes = [
  "Why do JavaScript developers wear glasses? Because they don't C#!",
  "What's the object-oriented way to become wealthy? Inheritance.",
  "Why did the programmer quit his job? Because he didn't get arrays.",
];
// --- END OF ADDED CODE ---

const COMPUTER_ID = "RPS_COMPUTER";
const COMPUTER_NAME = "Computer";

function randomRps() {
  const opts = ["rock", "paper", "scissors"];
  return opts[Math.floor(Math.random() * opts.length)];
}

function initRecord(userId) {
  if (!winLoss[userId]) winLoss[userId] = { wins: 0, losses: 0, ties: 0 };
}

function bumpRecord(userId, outcome /* 'win' | 'lose' | 'tie' */) {
  initRecord(userId);
  if (outcome === "win") winLoss[userId].wins++;
  else if (outcome === "lose") winLoss[userId].losses++;
  else winLoss[userId].ties++;
}

function decideOutcome(p1Choice, p2Choice) {
  const a = String(p1Choice).toLowerCase();
  const b = String(p2Choice).toLowerCase();
  if (a === b) return "tie";
  const beats = { rock: "scissors", paper: "rock", scissors: "paper" };
  return beats[a] === b ? "p1" : "p2";
}
/**
 * Interactions endpoint URL where Discord will send HTTP requests
 * Parse request body and verifies incoming requests using discord-interactions package
 */
app.post(
  "/interactions",
  verifyKeyMiddleware(process.env.PUBLIC_KEY),
  async function (req, res) {
    // Interaction id, type and data
    const { id, type, data } = req.body;

    /**
     * Handle verification requests
     */
    if (type === InteractionType.PING) {
      return res.send({ type: InteractionResponseType.PONG });
    }

    /**
     * Handle slash command requests
     * See https://discord.com/developers/docs/interactions/application-commands#slash-commands
     */
    if (type === InteractionType.APPLICATION_COMMAND) {
      const { name, options } = data; // 'options' is needed for joke command
      // Interaction context
      const context = req.body.context;
      // User ID is in user field for (G)DMs, and member for servers
      const userId = context === 0 ? req.body.member.user.id : req.body.user.id;

      // "test" command
      if (name === "test") {
        // ALL_COMMANDS[0] is the test command
        incrementCommandUsage(userId, ALL_COMMANDS[0]);

        // Send a message into the channel where command was triggered from
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: InteractionResponseFlags.IS_COMPONENTS_V2,
            components: [
              {
                type: MessageComponentTypes.TEXT_DISPLAY,
                // Fetches a random emoji to send from a helper function
                content: `hello world ${getRandomEmoji()}`,
              },
            ],
          },
        });
      }

      // "typerace" command
      if (name === "typerace") {
        const gameId = id;
        const passage = (await import('./typerace.js')).pickPassage();
        activeTypeRaces[gameId] = {
          passage,
          host: userId,
          startTime: null,
          results: [],
          channelId: req.body.channel_id,
        };

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: InteractionResponseFlags.IS_COMPONENTS_V2,
            components: [
              {
                type: MessageComponentTypes.TEXT_DISPLAY,
                content: `Type Race started by <@${userId}>\n\nPassage:\n\`${passage}\`\n\nHost must click **Begin** to start the race. Players click **Start** to open the typing modal.`,
              },
              {
                type: MessageComponentTypes.ACTION_ROW,
                components: [
                  {
                    type: MessageComponentTypes.BUTTON,
                    custom_id: `typerace_begin_${gameId}`,
                    label: "Begin",
                    style: ButtonStyleTypes.PRIMARY,
                  },
                  {
                    type: MessageComponentTypes.BUTTON,
                    custom_id: `typerace_start_${gameId}`,
                    label: "Start",
                    style: ButtonStyleTypes.SECONDARY,
                  },
                  {
                    type: MessageComponentTypes.BUTTON,
                    custom_id: `typerace_leaderboard_${gameId}`,
                    label: "Leaderboard",
                    style: ButtonStyleTypes.SECONDARY,
                  },
                ],
              },
            ],
          },
        });
      }

      // "challenge" command
      if (name === "challenge" && id) {
        // User ID is in user field for (G)DMs, and member for servers
        const userId = req.body.member?.user?.id ?? req.body.user?.id;
        // User's object choice
        const objectName = req.body.data.options[0].value;

        // Create active game using message ID as the game ID
        activeGames[id] = {
          id: userId,
          objectName,
        };

        // ALL_COMMANDS[1] is the challenge command
        incrementCommandUsage(userId, ALL_COMMANDS[1]);
        initRecord(userId);
        initRecord(COMPUTER_ID);

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: InteractionResponseFlags.IS_COMPONENTS_V2,
            components: [
              {
                type: MessageComponentTypes.TEXT_DISPLAY,
                // Fetches a random emoji to send from a helper function
                content: `Rock papers scissors challenge from <@${userId}>`,
              },
              {
                type: MessageComponentTypes.ACTION_ROW,
                components: [
                  {
                    type: MessageComponentTypes.BUTTON,
                    // Append the game ID to use later on
                    custom_id: `accept_button_${req.body.id}`,
                    label: "Accept",
                    style: ButtonStyleTypes.PRIMARY,
                  },
                ],
              },
            ],
          },
        });
      }

      // "hangman" command
      if (name === "hangman") {
        const lengthOption = options?.find((o) => o.name === "number");
        const requestedLength = lengthOption
          ? Number(lengthOption.value)
          : null;

        // pick a word
        let word = null;
        if (requestedLength) word = pickWordByLength(requestedLength);
        if (!word) word = pickRandomWord();

        if (!word) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: "Sorry — no words available right now." },
          });
        }

        // create game state
        const gameId = id; // use interaction id as game id
        activeHangmanGames[gameId] = {
          word,
          guessed: [],
          wrong: 0,
          wrongLetters: [],
          maxWrong: 6,
          host: userId,
        };

        // Build letter select options split into two groups (A-M, N-Z)
        const letters = "abcdefghijklmnopqrstuvwxyz".split("");
        const guessedSetStart = new Set(activeHangmanGames[gameId].guessed);
        const first = letters
          .slice(0, 13)
          .filter((ch) => !guessedSetStart.has(ch))
          .map((ch) => ({ label: ch.toUpperCase(), value: ch }));
        const second = letters
          .slice(13)
          .filter((ch) => !guessedSetStart.has(ch))
          .map((ch) => ({ label: ch.toUpperCase(), value: ch }));

        const masked = maskWord(word, []);
        const wrongListStrStart = ""; // no wrong letters yet

        // increment usage for hangman command (if registered)
        const hangmanCmd = ALL_COMMANDS.find((c) => c.name === "hangman");
        if (hangmanCmd) incrementCommandUsage(userId, hangmanCmd);

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: InteractionResponseFlags.IS_COMPONENTS_V2,
            components: [
              {
                type: MessageComponentTypes.TEXT_DISPLAY,
                content: `Hangman started by <@${userId}> — Word: \`${masked}\`  (wrong: 0/${activeHangmanGames[gameId].maxWrong})${wrongListStrStart}`,
              },
              ...(first.length
                ? [
                    {
                      type: MessageComponentTypes.ACTION_ROW,
                      components: [
                        {
                          type: MessageComponentTypes.STRING_SELECT,
                          custom_id: `hangman_guess_${gameId}_1`,
                          placeholder: "Guess a letter (A-M)",
                          options: first,
                        },
                      ],
                    },
                  ]
                : []),
              ...(second.length
                ? [
                    {
                      type: MessageComponentTypes.ACTION_ROW,
                      components: [
                        {
                          type: MessageComponentTypes.STRING_SELECT,
                          custom_id: `hangman_guess_${gameId}_2`,
                          placeholder: "Guess a letter (N-Z)",
                          options: second,
                        },
                      ],
                    },
                  ]
                : []),
              {
                type: MessageComponentTypes.ACTION_ROW,
                components: [
                  {
                    type: MessageComponentTypes.BUTTON,
                    custom_id: `hangman_solve_${gameId}`,
                    label: "Solve",
                    style: ButtonStyleTypes.SECONDARY,
                  },
                ],
              },
            ],
          },
        });
      }

      // "submit" command (for TypeRace submissions without modal)
      if (name === "submit") {
        const textOption = options?.find((o) => o.name === "text");
        const gameOption = options?.find((o) => o.name === "game");
        const typed = textOption?.value;
        const providedGame = gameOption?.value;
        const callerId = req.body.member?.user?.id ?? req.body.user?.id;

        if (!typed) {
          return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { flags: InteractionResponseFlags.EPHEMERAL, content: 'No text provided.' } });
        }

        // find game: use provided game id or search for active race in same channel
        let game = null;
        if (providedGame) game = activeTypeRaces[providedGame];
        else {
          game = Object.values(activeTypeRaces).find((g) => g.channelId === req.body.channel_id && g.startTime);
        }

        if (!game) {
          return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { flags: InteractionResponseFlags.EPHEMERAL, content: 'No active race found in this channel.' } });
        }

        const submitTime = Date.now();
        const elapsed = Math.max(0, submitTime - (game.startTime || submitTime));
        const { computeStats } = await import('./typerace.js');
        const stats = computeStats(game.passage, typed, elapsed);

        game.results.push({ userId: callerId, ...stats });

        // respond to the submitter with their stats
        const rank = game.results.slice().sort((a, b) => b.netWPM - a.netWPM).findIndex((r) => r.userId === callerId) + 1;
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { flags: InteractionResponseFlags.EPHEMERAL, content: `Submission recorded — ${stats.netWPM} WPM (accuracy ${Math.round(stats.accuracy*100)}%). Current rank: ${rank}` } });
      }

      if (name === "rules") {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [
              {
                title: "Bot Theme & Rules",
                description: BOT_THEME.description,
                fields: [
                  {
                    name: "Rules",
                    value: BOT_THEME.rules
                      .map((r, i) => `${i + 1}. ${r}`)
                      .join("\n"),
                  },
                  {
                    name: "Example Commands",
                    value: BOT_THEME.exampleCommands.join("\n"),
                  },
                ],
                color: 0x00ff00,
              },
            ],
          },
        });
      }

      // --- JOKE COMMAND LOGIC ADDED HERE ---
      if (name === "joke") {
        // Find the joke command to pass to increment
        const jokeCommand = ALL_COMMANDS.find((cmd) => cmd.name === "joke");
        if (jokeCommand) {
          incrementCommandUsage(userId, jokeCommand);
        }

        let jokeContent;
        // Check if the user provided a number option
        const choiceOption = options?.find((opt) => opt.name === "number");

        if (choiceOption) {
          const choice = choiceOption.value;
          if (choice >= 1 && choice <= jokes.length) {
            // Adjust for 0-based array index
            jokeContent = `Joke #${choice}: ${jokes[choice - 1]}`;
          } else {
            jokeContent = `Sorry, I only have ${jokes.length} jokes. Please pick a number between 1 and ${jokes.length}.`;
          }
        } else {
          // If no number is provided, pick a random joke
          const randomIndex = Math.floor(Math.random() * jokes.length);
          jokeContent = jokes[randomIndex];
        }

        // Send the joke back to the channel
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: jokeContent,
          },
        });
      }
      // --- END OF ADDED JOKE LOGIC ---

      console.error(`unknown command: ${name}`);
      return res.status(400).json({ error: "unknown command" });
    }

    // Handle modal submissions (solve modal)
    if (type === InteractionType.MODAL_SUBMIT) {
      const modalId = data.custom_id; // e.g. hangman_solve_modal_<gameId>
      // Handle TypeRace modal submissions
      if (typeof modalId === 'string' && modalId.startsWith('typerace_modal_')) {
        // modalId format: typerace_modal_<gameId>_<userId>
        const parts = modalId.split('_');
        const gameId = parts[2];
        const userId = parts.slice(3).join('_');
        const game = activeTypeRaces[gameId];
        if (!game) {
          return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { flags: InteractionResponseFlags.EPHEMERAL, content: 'Race not found.' } });
        }

        // extract typed value
        let typed = null;
        try {
          const comps = req.body.data?.components || [];
          if (comps[0] && comps[0].components && comps[0].components[0]) {
            typed = comps[0].components[0].value;
          }
        } catch (err) {
          console.error('typerace modal parse error', err);
        }

        if (!typed) {
          return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { flags: InteractionResponseFlags.EPHEMERAL, content: 'No input received.' } });
        }

        const submitTime = Date.now();
        const elapsed = Math.max(0, submitTime - (game.startTime || submitTime));

        const { computeStats } = await import('./typerace.js');
        const stats = computeStats(game.passage, typed, elapsed);

        // record result
        game.results.push({ userId, ...stats });

        // update public message leaderboard (we'll try to UPDATE_MESSAGE)
        try {
          const rows = game.results.slice().sort((a, b) => b.netWPM - a.netWPM).map((r, i) => `${i + 1}. <@${r.userId}> — ${r.netWPM} WPM (${Math.round(r.accuracy*100)}%)`).join('\n');
          await res.send({ type: InteractionResponseType.UPDATE_MESSAGE, data: { components: [ { type: MessageComponentTypes.TEXT_DISPLAY, content: `Type Race — passage:\n\`${game.passage}\`\n\nLeaderboard:\n${rows}` } ] } });
        } catch (err) {
          console.error('typerace modal update error', err);
        }
        return;
      }
      if (
        typeof modalId === "string" &&
        modalId.startsWith("hangman_solve_modal_")
      ) {
        const gameId = modalId.replace("hangman_solve_modal_", "");
        const game = activeHangmanGames[gameId];
        // modal components structure: data.components[0].components[0].value
        let guess = null;
        try {
          const comps = req.body.data?.components || [];
          if (comps[0] && comps[0].components && comps[0].components[0]) {
            guess = comps[0].components[0].value;
          }
        } catch (err) {
          console.error("hangman modal parse error", err);
        }

        if (!game) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: InteractionResponseFlags.EPHEMERAL,
              content: "This hangman game no longer exists.",
            },
          });
        }

        if (!guess) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: InteractionResponseFlags.EPHEMERAL,
              content: "No guess received.",
            },
          });
        }

        const normalized = String(guess).trim().toLowerCase();
        if (normalized === game.word.toLowerCase()) {
          // correct: try to update the original message if available
          try {
            if (req.body.message && req.body.message.id) {
              await res.send({
                type: InteractionResponseType.UPDATE_MESSAGE,
                data: {
                  components: [
                    {
                      type: MessageComponentTypes.TEXT_DISPLAY,
                      content: `🎉 <@${
                        req.body.member?.user?.id ?? req.body.user?.id
                      }> solved the word! **${game.word}** (wrong: ${
                        game.wrong
                      }/${game.maxWrong}${
                        game.wrongLetters.length
                          ? " — wrong letters/guesses: " +
                            game.wrongLetters.join(", ")
                          : ""
                      })`,
                    },
                  ],
                },
              });
            } else {
              // fallback: post a public message
              await res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                  content: `🎉 <@${
                    req.body.member?.user?.id ?? req.body.user?.id
                  }> solved the hangman: **${game.word}**`,
                },
              });
            }
          } catch (err) {
            console.error("hangman modal update error", err);
          }
          delete activeHangmanGames[gameId];
        } else {
          // incorrect: record as a wrong guess and reply ephemerally
          game.wrong++;
          game.wrongLetters.push(guess.toUpperCase());
          try {
            await res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                flags: InteractionResponseFlags.EPHEMERAL,
                content: `Incorrect solve attempt: **${guess}** — (${game.wrong}/${game.maxWrong} wrong)`,
              },
            });
          } catch (err) {
            console.error("hangman modal incorrect reply error", err);
          }

          // if too many wrongs, end the game and update original message if possible
          if (game.wrong >= game.maxWrong) {
            try {
              if (req.body.message && req.body.message.id) {
                await res.send({
                  type: InteractionResponseType.UPDATE_MESSAGE,
                  data: {
                    components: [
                      {
                        type: MessageComponentTypes.TEXT_DISPLAY,
                        content: `☠️ Game over — the word was **${
                          game.word
                        }** (wrong: ${game.wrong}/${
                          game.maxWrong
                        } — wrong letters/guesses: ${game.wrongLetters.join(
                          ", "
                        )})`,
                      },
                    ],
                  },
                });
              } else {
                await res.send({
                  type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                  data: {
                    content: `☠️ Game over — the word was **${game.word}**`,
                  },
                });
              }
            } catch (err) {
              console.error("hangman modal endgame update error", err);
            }
            delete activeHangmanGames[gameId];
          }
        }

        return;
      }
    }

    if (type === InteractionType.MESSAGE_COMPONENT) {
      // custom_id set in payload when sending message component
      const componentId = data.custom_id;

      if (componentId.startsWith("accept_button_")) {
        // get the associated game ID
        const gameId = componentId.replace("accept_button_", "");
        // Delete message with token in request body
        const endpoint = `webhooks/${
          req.body.application_id ?? process.env.APP_ID
        }/${req.body.token}/messages/${req.body.message.id}`;

        // Who clicked "Accept"
        const actorId = req.body.member?.user?.id ?? req.body.user?.id;
        const challengerId = activeGames[gameId]?.id;

        console.log("ACCEPT click", {
          gameId,
          actorId,
          challengerId,
          hasGame: !!activeGames[gameId],
        });

        //vs Computer
        if (challengerId && actorId === challengerId) {
          try {
            const challengerChoice = activeGames[gameId].objectName;
            const botChoice = randomRps();

            // decide outcome
            const whoWon = decideOutcome(challengerChoice, botChoice); // 'p1' | 'p2' | 'tie'

            // update records: challenger (p1) vs Computer (p2)
            if (whoWon === "p1") {
              bumpRecord(challengerId, "win");
              bumpRecord(COMPUTER_ID, "lose");
            } else if (whoWon === "p2") {
              bumpRecord(challengerId, "lose");
              bumpRecord(COMPUTER_ID, "win");
            } else {
              bumpRecord(challengerId, "tie");
              bumpRecord(COMPUTER_ID, "tie");
            }

            const cRec = winLoss[challengerId];
            const bRec = winLoss[COMPUTER_ID];
            const header = `Rock paper scissors vs ${COMPUTER_NAME}`;
            const summary = `<@${challengerId}> chose **${challengerChoice}**, ${COMPUTER_NAME} chose **${botChoice}**.`;
            const outcomeLine =
              whoWon === "p1"
                ? `<@${challengerId}> wins!`
                : whoWon === "p2"
                ? `${COMPUTER_NAME} wins!`
                : `It's a tie!`;
            const recordsLine =
              `\n\n**Records**\n` +
              `• <@${challengerId}> — ${cRec.wins}-${cRec.losses}-${cRec.ties}\n` +
              `• ${COMPUTER_NAME} — ${bRec.wins}-${bRec.losses}-${bRec.ties}`;

            // send the public result
            await res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                flags: InteractionResponseFlags.IS_COMPONENTS_V2,
                components: [
                  {
                    type: MessageComponentTypes.TEXT_DISPLAY,
                    content: `${header}\n${summary}\n${outcomeLine}${recordsLine}`,
                  },
                ],
              },
            });

            // delete the original challenge message (remove Accept button)
            await DiscordRequest(endpoint, { method: "DELETE" });

            // close out the game
            delete activeGames[gameId];
            return;
          } catch (err) {
            console.error("Self-accept (vs Computer) flow error:", err);
          }
        }

        // --- Normal two-player path
        try {
          await res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              // Indicates it'll be an ephemeral message
              flags:
                InteractionResponseFlags.EPHEMERAL |
                InteractionResponseFlags.IS_COMPONENTS_V2,
              components: [
                {
                  type: MessageComponentTypes.TEXT_DISPLAY,
                  content: "What is your object of choice?",
                },
                {
                  type: MessageComponentTypes.ACTION_ROW,
                  components: [
                    {
                      type: MessageComponentTypes.STRING_SELECT,
                      // Append game ID
                      custom_id: `select_choice_${gameId}`,
                      options: getShuffledOptions(),
                    },
                  ],
                },
              ],
            },
          });
          // Delete previous message
          await DiscordRequest(endpoint, { method: "DELETE" });
        } catch (err) {
          console.error("Error sending message:", err);
        }
      } else if (componentId.startsWith("select_choice_")) {
        // get the associated game ID
        const gameId = componentId.replace("select_choice_", "");

        if (activeGames[gameId]) {
          // Get user ID and object choice for responding user
          // User ID is in user field for (G)DMs, and member for servers
          const userId = req.body.member?.user?.id ?? req.body.user?.id;
          const objectName = data.values[0];

          // challenger (p1) vs opponent (p2)
          const challengerId = activeGames[gameId].id;
          const challengerChoice = activeGames[gameId].objectName;
          const opponentId = userId;
          const opponentChoice = objectName;

          // Decide outcome without string parsing
          const whoWon = decideOutcome(challengerChoice, opponentChoice); // 'p1' | 'p2' | 'tie'

          // Update records
          if (whoWon === "p1") {
            bumpRecord(challengerId, "win");
            bumpRecord(opponentId, "lose");
          } else if (whoWon === "p2") {
            bumpRecord(challengerId, "lose");
            bumpRecord(opponentId, "win");
          } else {
            bumpRecord(challengerId, "tie");
            bumpRecord(opponentId, "tie");
          }

          // Calculate result from helper function
          const resultStr = getResult(
            { id: challengerId, objectName: challengerChoice },
            { id: opponentId, objectName: opponentChoice }
          );

          // Remove game from storage
          delete activeGames[gameId];
          // Update message with token in request body
          const endpoint = `webhooks/${
            req.body.application_id ?? process.env.APP_ID
          }/${req.body.token}/messages/${req.body.message.id}`;

          const cRec = winLoss[challengerId];
          const oRec = winLoss[opponentId];

          const recordsLine =
            `\n\n**Records**\n` +
            `• <@${challengerId}> — ${cRec.wins}-${cRec.losses}-${cRec.ties}\n` +
            `• <@${opponentId}> — ${oRec.wins}-${oRec.losses}-${oRec.ties}`;

          try {
            // Send results
            await res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                flags: InteractionResponseFlags.IS_COMPONENTS_V2,
                components: [
                  {
                    type: MessageComponentTypes.TEXT_DISPLAY,
                    content: `${resultStr}${recordsLine}`,
                  },
                ],
              },
            });
            // Update ephemeral message
            await DiscordRequest(endpoint, {
              method: "PATCH",
              body: {
                components: [
                  {
                    type: MessageComponentTypes.TEXT_DISPLAY,
                    content: "Nice choice " + getRandomEmoji(),
                  },
                ],
              },
            });
          } catch (err) {
            console.error("Error sending message:", err);
          }
        }
      }
      // TypeRace: host begins the race
      else if (componentId.startsWith("typerace_begin_")) {
        const gameId = componentId.replace("typerace_begin_", "");
        const game = activeTypeRaces[gameId];
        if (!game) {
          return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { flags: InteractionResponseFlags.EPHEMERAL, content: 'Race not found.' } });
        }
        // only host can begin
        const clicker = req.body.member?.user?.id ?? req.body.user?.id;
        if (clicker !== game.host) {
          return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { flags: InteractionResponseFlags.EPHEMERAL, content: 'Only the host can begin the race.' } });
        }

        game.startTime = Date.now();

        try {
          await res.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: {
              components: [
                { type: MessageComponentTypes.TEXT_DISPLAY, content: `Race started by <@${game.host}> — passage:\n\`${game.passage}\`\nPlayers may now click Start to open the typing modal.` },
                { type: MessageComponentTypes.ACTION_ROW, components: [ { type: MessageComponentTypes.BUTTON, custom_id: `typerace_start_${gameId}`, label: 'Start', style: ButtonStyleTypes.SECONDARY }, { type: MessageComponentTypes.BUTTON, custom_id: `typerace_leaderboard_${gameId}`, label: 'Leaderboard', style: ButtonStyleTypes.SECONDARY } ] },
              ],
            },
          });
        } catch (err) {
          console.error('typerace begin error', err);
        }
        return;
      }

      // TypeRace: player clicks Start — show modal if race started
      else if (componentId.startsWith("typerace_start_")) {
        const gameId = componentId.replace("typerace_start_", "");
        const game = activeTypeRaces[gameId];
        if (!game) return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { flags: InteractionResponseFlags.EPHEMERAL, content: 'Race not found.' } });
        if (!game.startTime) return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { flags: InteractionResponseFlags.EPHEMERAL, content: 'Race has not begun yet.' } });

        // Send modal for typing
        try {
          await res.send({
            type: InteractionResponseType.MODAL,
            data: {
              custom_id: `typerace_modal_${gameId}_${req.body.member?.user?.id ?? req.body.user?.id}`,
              title: 'Type Race — Submit your text',
              components: [
                { type: 1, components: [ { type: 4, custom_id: 'typed_input', style: 2, label: 'Paste/type the passage exactly', required: true, min_length: 1 } ] },
              ],
            },
          });
        } catch (err) {
          console.error('typerace start modal error', err);
        }
        return;
      }

      // TypeRace: show leaderboard (ephemeral)
      else if (componentId.startsWith("typerace_leaderboard_")) {
        const gameId = componentId.replace("typerace_leaderboard_", "");
        const game = activeTypeRaces[gameId];
        if (!game) return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { flags: InteractionResponseFlags.EPHEMERAL, content: 'Race not found.' } });
        const rows = (game.results || []).slice().sort((a, b) => b.netWPM - a.netWPM).map((r, i) => `${i + 1}. <@${r.userId}> — ${r.netWPM} WPM (${Math.round(r.accuracy*100)}%)`).join('\n') || 'No results yet.';
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { flags: InteractionResponseFlags.EPHEMERAL, content: `Leaderboard:\n${rows}` } });
      }

      // Solve button click handling — open a modal for the user to input full-word guess
      else if (componentId.startsWith("hangman_solve_")) {
        const gameId = componentId.replace("hangman_solve_", "");
        // Respond with a modal containing a single text input
        try {
          await res.send({
            type: InteractionResponseType.MODAL,
            data: {
              custom_id: `hangman_solve_modal_${gameId}`,
              title: "Solve Hangman",
              components: [
                {
                  type: 1,
                  components: [
                    {
                      type: 4,
                      custom_id: "solve_input",
                      style: 1,
                      label: "Enter full word",
                      required: true,
                      min_length: 1,
                    },
                  ],
                },
              ],
            },
          });
        } catch (err) {
          console.error("hangman solve modal error", err);
        }
        return;
      }

      // hangman guesses (two select components per game)
      else if (componentId.startsWith("hangman_guess_")) {
        // extract game id (componentId format: "hangman_guess_<gameId>_1")
        const rest = componentId.substring("hangman_guess_".length);
        const gameId = rest.replace(/_\d+$/, "");

        const game = activeHangmanGames[gameId];
        if (!game) {
          try {
            await res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                flags: InteractionResponseFlags.EPHEMERAL,
                content: "This hangman game no longer exists.",
              },
            });
          } catch (err) {
            console.error("hangman: failed to reply to missing game", err);
          }
          return;
        }

        const letter = data.values[0].toLowerCase();
        if (game.guessed.includes(letter)) {
          await res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: InteractionResponseFlags.EPHEMERAL,
              content: `You've already guessed **${letter.toUpperCase()}**`,
            },
          });
          return;
        }

        game.guessed.push(letter);
        if (!game.word.includes(letter)) {
          // record wrong letter
          game.wrongLetters.push(letter.toUpperCase());
          game.wrong++;
        }

        const masked = maskWord(game.word, game.guessed);

        try {
          if (!masked.includes("_")) {
            // win — update the original message
            await res.send({
              type: InteractionResponseType.UPDATE_MESSAGE,
              data: {
                components: [
                  {
                    type: MessageComponentTypes.TEXT_DISPLAY,
                    content: `🎉 <@${
                      req.body.member?.user?.id ?? req.body.user?.id
                    }> solved the word! **${game.word}** (wrong: ${
                      game.wrong
                    }/${game.maxWrong}${
                      game.wrongLetters.length
                        ? " — wrong letters/guesses: " +
                          game.wrongLetters.join(", ")
                        : ""
                    })`,
                  },
                ],
              },
            });
            delete activeHangmanGames[gameId];
            return;
          }

          if (game.wrong >= game.maxWrong) {
            // lost — update the original message
            await res.send({
              type: InteractionResponseType.UPDATE_MESSAGE,
              data: {
                components: [
                  {
                    type: MessageComponentTypes.TEXT_DISPLAY,
                    content: `☠️ Game over — the word was **${
                      game.word
                    }** (wrong: ${game.wrong}/${game.maxWrong}${
                      game.wrongLetters.length
                        ? " — wrong letters/guesses: " +
                          game.wrongLetters.join(", ")
                        : ""
                    })`,
                  },
                ],
              },
            });
            delete activeHangmanGames[gameId];
            return;
          }

          // update the public message with new mask and wrong count
          // keep the select components so players can continue guessing
          const letters = "abcdefghijklmnopqrstuvwxyz".split("");
          const guessedSet = new Set(game.guessed);
          const first = letters
            .slice(0, 13)
            .filter((ch) => !guessedSet.has(ch))
            .map((ch) => ({ label: ch.toUpperCase(), value: ch }));
          const second = letters
            .slice(13)
            .filter((ch) => !guessedSet.has(ch))
            .map((ch) => ({ label: ch.toUpperCase(), value: ch }));

          await res.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: {
              components: [
                {
                  type: MessageComponentTypes.TEXT_DISPLAY,
                  content: `Hangman — Word: \`${masked}\`  (wrong: ${
                    game.wrong
                  }/${game.maxWrong}${
                    game.wrongLetters.length
                      ? " — wrong letters/guesses: " +
                        game.wrongLetters.join(", ")
                      : ""
                  })`,
                },
                ...(first.length
                  ? [
                      {
                        type: MessageComponentTypes.ACTION_ROW,
                        components: [
                          {
                            type: MessageComponentTypes.STRING_SELECT,
                            custom_id: `hangman_guess_${gameId}_1`,
                            placeholder: "Guess a letter (A-M)",
                            options: first,
                          },
                        ],
                      },
                    ]
                  : []),
                ...(second.length
                  ? [
                      {
                        type: MessageComponentTypes.ACTION_ROW,
                        components: [
                          {
                            type: MessageComponentTypes.STRING_SELECT,
                            custom_id: `hangman_guess_${gameId}_2`,
                            placeholder: "Guess a letter (N-Z)",
                            options: second,
                          },
                        ],
                      },
                    ]
                  : []),
                {
                  type: MessageComponentTypes.ACTION_ROW,
                  components: [
                    {
                      type: MessageComponentTypes.BUTTON,
                      custom_id: `hangman_solve_${gameId}`,
                      label: "Solve",
                      style: ButtonStyleTypes.SECONDARY,
                    },
                  ],
                },
              ],
            },
          });
        } catch (err) {
          console.error("hangman guess handling error", err);
        }
        return;
      }

      return;
    }

    console.error("unknown interaction type", type);
    return res.status(400).json({ error: "unknown interaction type" });
  }
);

app.listen(PORT, () => {
  console.log("Listening on port", PORT);
});
