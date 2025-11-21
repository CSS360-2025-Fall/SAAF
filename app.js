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
// UPDATED IMPORT
import {
  getShuffledOptions,
  getResult,
  createDeck,
  shuffleDeck,
  getCardInfo,
  getZodiacSign,
} from "./game.js";
import { incrementCommandUsage } from "./db/commandUsage.js";
import { ALL_COMMANDS } from "./commands.js";

const winLoss = Object.create(null);
const app = express();
const PORT = process.env.PORT || 3000;
const activeGames = {};
// Hangman games stored separately
const activeHangmanGames = {};
// Higher Lower games
const activeHigherLowerGames = {};

const BOT_THEME = {
  description: "A fun Discord bot to play quick games like Rock Paper Scissors with friends!",
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

const jokes = [
  "Why do JavaScript developers wear glasses? Because they don't C#!",
  "What's the object-oriented way to become wealthy? Inheritance.",
  "Why did the programmer quit his job? Because he didn't get arrays.",
];

// ---------------------------
// GUESS THE SONG GAME SUPPORT
// ---------------------------
const songs = [
  { title: "Baby - Justin Bieber", emojis: "👶💕🎶" },
  { title: "Circus - Britney Spears", emojis: "🎪🤹‍♀️✨" },
  { title: "Thriller - Michael Jackson", emojis: "🧛‍♂️🌕🧟‍♂️" },
  { title: "Let It Go - Idina Menzel (from Frozen)", emojis: "❄️👸🎤" },
  { title: "Rolling in the Deep - Adele", emojis: "🌊🎵💔"},
  { title: "Umbrella - Rihanna", emojis: "☔👑🌧️" },
];

function getRandomSong() {
  return songs[Math.floor(Math.random() * songs.length)];
}

const activeSongGames = {};


const COMPUTER_ID = "RPS_COMPUTER";
const COMPUTER_NAME = "Computer";

function randomRps() {
  const opts = ["rock", "paper", "scissors"];
  return opts[Math.floor(Math.random() * opts.length)];
}

function initRecord(userId) {
  if (!winLoss[userId]) winLoss[userId] = { wins: 0, losses: 0, ties: 0 };
}

function bumpRecord(userId, outcome) {
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

app.post(
  "/interactions",
  verifyKeyMiddleware(process.env.PUBLIC_KEY),
  async function (req, res) {
    const { id, type, data } = req.body;

    if (type === InteractionType.PING) {
      return res.send({ type: InteractionResponseType.PONG });
    }

    // ------------------------------------------------------------------
    // FIXED: Entire APPLICATION_COMMAND block with coinflip + joke inside
    // ------------------------------------------------------------------
    if (type === InteractionType.APPLICATION_COMMAND) {
      const { name, options } = data;
      const context = req.body.context;
      const userId = context === 0 ? req.body.member?.user?.id : req.body.user?.id;

      // TEST COMMAND
      if (name === "test") {
        incrementCommandUsage(userId, ALL_COMMANDS[0]);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: InteractionResponseFlags.IS_COMPONENTS_V2,
            components: [
              {
                type: MessageComponentTypes.TEXT_DISPLAY,
                content: `hello world ${getRandomEmoji()}`,
              },
            ],
          },
        });
      }

      // CHALLENGE COMMAND
      if (name === "challenge" && id) {
        const userId = req.body.member?.user?.id ?? req.body.user?.id;
        const objectName = req.body.data.options[0].value;

        activeGames[id] = { id: userId, objectName };

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
                content: `Rock papers scissors challenge from <@${userId}>`,
              },
              {
                type: MessageComponentTypes.ACTION_ROW,
                components: [
                  {
                    type: MessageComponentTypes.BUTTON,
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

      // RULES COMMAND
      if (name === "rules") {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [
              {
                title: "Bot Theme & Rules",
                description: BOT_THEME.description,
                fields: [
                  { name: "Rules", value: BOT_THEME.rules.map((r,i)=>`${i+1}. ${r}`).join('\n') },
                  { name: "Example Commands", value: BOT_THEME.exampleCommands.join('\n') },
                ],
                color: 0x00ff00,
              },
            ],
          },
        });
      }

      // -----------------------------------------
      // COINFLIP (FIXED: moved inside command block)
      // -----------------------------------------
      if (name === "coinflip") {
        const coinflipCommand = ALL_COMMANDS.find((cmd) => cmd.name === "coinflip");
        if (coinflipCommand) incrementCommandUsage(userId, coinflipCommand);

        const result = Math.random() < 0.5 ? "Heads" : "Tails";

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: `🪙 The coin landed on **${result}**!` },
        });
      }

      // -----------------------------------------
      // JOKE (FIXED: moved inside command block)
      // -----------------------------------------
      if (name === "joke") {
        const jokeCommand = ALL_COMMANDS.find((cmd) => cmd.name === "joke");
        if (jokeCommand) incrementCommandUsage(userId, jokeCommand);

        let jokeContent;
        const choiceOption = options?.find((opt) => opt.name === "number");

        if (choiceOption) {
          const num = choiceOption.value;
          if (num >= 1 && num <= jokes.length)
            jokeContent = `Joke #${num}: ${jokes[num - 1]}`;
          else
            jokeContent = `Please pick a number between 1 and ${jokes.length}.`;
        } else {
          const randomIndex = Math.floor(Math.random() * jokes.length);
          jokeContent = jokes[randomIndex];
        }

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: jokeContent },
        });
      }

      

    // -----------------------------------------
      // GUESS THE SONG COMMAND
      // -----------------------------------------
      if (name === "guesssong") {
        const songGameCommand = ALL_COMMANDS.find(cmd => cmd.name === "guesssong");
        if (songGameCommand) incrementCommandUsage(userId, songGameCommand);
        const song = getRandomSong();
        activeSongGames[id] = { userId, song };

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: InteractionResponseFlags.IS_COMPONENTS_V2,
            components: [
              {
                type: MessageComponentTypes.TEXT_DISPLAY,
                content: `🎵 Guess the song from these emojis: ${song.emojis}`,
              },
              {
                type: MessageComponentTypes.ACTION_ROW,
                components: [
                  {
                    type: MessageComponentTypes.STRING_SELECT,
                    custom_id: `guesssong_select_${id}`,
                    options: songs.map((s, i) => ({
                      label: s.title,
                      value: String(i),
                    })),
                  },
                ],
              },
            ],
          },
        });
      }


      console.error(`unknown command: ${name}`);
      return res.status(400).json({ error: "unknown command" });
    }
    // ------------------------------------------------------------------
    // END FIXED APPLICATION_COMMAND BLOCK
    // ------------------------------------------------------------------


    // MESSAGE COMPONENT HANDLING (unchanged)
    if (type === InteractionType.MESSAGE_COMPONENT) {
      const componentId = data.custom_id;

      if (componentId.startsWith("accept_button_")) {
        const gameId = componentId.replace("accept_button_", "");
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/${req.body.message.id}`;

        const actorId = req.body.member?.user?.id ?? req.body.user?.id;
        const challengerId = activeGames[gameId]?.id;

        // vs COMPUTER
        if (challengerId && actorId === challengerId) {
          try {
            const challengerChoice = activeGames[gameId].objectName;
            const botChoice = randomRps();
            const whoWon = decideOutcome(challengerChoice, botChoice);

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

            await DiscordRequest(endpoint, { method: "DELETE" });
            delete activeGames[gameId];
            return;
          } catch (err) {
            console.error("Self-accept flow error:", err);
          }
        }

        // NORMAL PLAYER VS PLAYER
        try {
          await res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
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
                      custom_id: `select_choice_${gameId}`,
                      options: getShuffledOptions(),
                    },
                  ],
                },
              ],
            },
          });

          await DiscordRequest(endpoint, { method: "DELETE" });
        } catch (err) {
          console.error("Error sending message:", err);
        }
      } else if (componentId.startsWith("select_choice_")) {
        const gameId = componentId.replace("select_choice_", "");

        if (activeGames[gameId]) {
          const userId = req.body.member?.user?.id ?? req.body.user?.id;
          const objectName = data.values[0];

          const challengerId = activeGames[gameId].id;
          const challengerChoice = activeGames[gameId].objectName;
          const opponentId = userId;
          const opponentChoice = objectName;

          const whoWon = decideOutcome(challengerChoice, opponentChoice);

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

          const resultStr = getResult(
            { id: challengerId, objectName: challengerChoice },
            { id: opponentId, objectName: opponentChoice }
          );

          delete activeGames[gameId];

          const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/${req.body.message.id}`;

          const cRec = winLoss[challengerId];
          const oRec = winLoss[opponentId];

          const recordsLine =
            `\n\n**Records**\n` +
            `• <@${challengerId}> — ${cRec.wins}-${cRec.losses}-${cRec.ties}\n` +
            `• <@${opponentId}> — ${oRec.wins}-${oRec.losses}-${oRec.ties}`;

          try {
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

      // -----------------------------------------
      // GUESS THE SONG SELECT HANDLER
      // -----------------------------------------
      if (componentId.startsWith("guesssong_select_")) {
        const gameId = componentId.replace("guesssong_select_", "");
        const selectedIndex = Number(data.values[0]);

        const game = activeSongGames[gameId];
        if (!game) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: "❌ Game not found or expired." }
          });
        }

        const correctIndex = songs.findIndex((s) => s.title === game.song.title);

        const message =
          selectedIndex === correctIndex
            ? `🎉 Correct! The song was **${game.song.title}**`
            : `❌ Wrong! The correct answer was **${game.song.title}**`;

        delete activeSongGames[gameId];

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: message },
        });
      }

      // --- HIGHER/LOWER BUTTON LOGIC ---
      else if (componentId.startsWith("hilo_")) {
        const userId = req.body.member?.user?.id ?? req.body.user?.id;
        const game = activeHigherLowerGames[userId];

        // Check if game exists for this user
        if (!game) {
          return res.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: {
              content:
                "This game has expired or was not found. Please start a new one with `/higherlower`.",
              components: [], // Remove buttons
            },
          });
        }

        const guess = componentId.replace("hilo_", "");

        // Handle user ending the game
        if (guess === "end") {
          const finalStreak = game.streak;
          delete activeHigherLowerGames[userId]; // Clean up game state
          return res.send({
            type: InteractionResponseType.UPDATE_MESSAGE, // Update the original message
            data: {
              content: `Game ended. Your final streak was: **${finalStreak}**!`,
              components: [], // Remove buttons
            },
          });
        }

        // --- Process the user's guess ---
        const currentInfo = getCardInfo(game.currentCard);
        const nextInfo = getCardInfo(game.nextCard);

        let correct = false;

        // Check the guess
        if (guess === "higher") {
          correct = nextInfo.value > currentInfo.value;
        } else if (guess === "lower") {
          correct = nextInfo.value < currentInfo.value;
        } else if (guess === "red") {
          correct = nextInfo.color === "Red";
        } else if (guess === "black") {
          correct = nextInfo.color === "Black";
        }

        // --- Handle Correct Guess ---
        if (correct) {
          game.streak++; // Increase streak

          // Check for win condition (deck empty)
          if (game.deck.length === 0) {
            const finalStreak = game.streak;
            delete activeHigherLowerGames[userId]; // Clean up
            return res.send({
              type: InteractionResponseType.UPDATE_MESSAGE,
              data: {
                content: `You guessed **${guess}**... The card was **${nextInfo.name}**. **You were right!**\n\n...and you finished the whole deck! 🏆\n**FINAL STREAK: ${finalStreak}**`,
                components: [],
              },
            });
          }

          // Continue game: move next card to current, draw a new next card
          game.currentCard = game.nextCard;
          game.nextCard = game.deck.pop();
          activeHigherLowerGames[userId] = game; // Update the game state

          const newCurrentInfo = getCardInfo(game.currentCard);

          // Respond with updated message and re-send the same buttons
          return res.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: {
              content: `You guessed **${guess}**... The card was **${
                nextInfo.name
              }**. **You were right!** ${getRandomEmoji()}\n\nYour new card is: **${
                newCurrentInfo.name
              }**\nStreak: ${game.streak}\nCards left in deck: ${
                game.deck.length
              }\n\nGuess if the next card will be...`,
              components: req.body.message.components, // Re-send the original buttons
            },
          });
        } else {
          // --- Handle Incorrect Guess ---
          const finalStreak = game.streak;
          delete activeHigherLowerGames[userId]; // Clean up game

          return res.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: {
              content: `You guessed **${guess}**... The card was **${nextInfo.name}**. **You were wrong!** 😥\n\nGame over. Your final streak was: **${finalStreak}**.`,
              components: [], // Remove buttons
            },
          });
        }
      }
      // --- END OF HILO BUTTON LOGIC ---

      return;
    }

    console.error("unknown interaction type", type);
    return res.status(400).json({ error: "unknown interaction type" });
  }
);

app.listen(PORT, () => {
  console.log("Listening on port", PORT);
});
