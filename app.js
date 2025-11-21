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
// Imported everything from game.js, including new Hangman logic
import {
  getShuffledOptions,
  getResult,
  createDeck,
  shuffleDeck,
  getCardInfo,
  getZodiacSign,
  pickWordByLength,
  pickRandomWord,
  maskWord,
} from "./game.js";
import { incrementCommandUsage } from "./db/commandUsage.js";
import { ALL_COMMANDS } from "./commands.js";

const winLoss = Object.create(null);
const app = express();
const PORT = process.env.PORT || 3000;

// Game States
const activeGames = {};
const activeHangmanGames = {};
const activeHigherLowerGames = {};
const activeSongGames = {};

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

const jokes = [
  "Why do JavaScript developers wear glasses? Because they don't C#!",
  "What's the object-oriented way to become wealthy? Inheritance.",
  "Why did the programmer quit his job? Because he didn't get arrays.",
];

// GUESS THE SONG DATA
const songs = [
  { title: "Baby - Justin Bieber", emojis: "👶💕🎶" },
  { title: "Circus - Britney Spears", emojis: "🎪🤹‍♀️✨" },
  { title: "Thriller - Michael Jackson", emojis: "🧛‍♂️🌕🧟‍♂️" },
  { title: "Let It Go - Idina Menzel (from Frozen)", emojis: "❄️👸🎤" },
  { title: "Rolling in the Deep - Adele", emojis: "🌊🎵💔" },
  { title: "Umbrella - Rihanna", emojis: "☔👑🌧️" },
];

function getRandomSong() {
  return songs[Math.floor(Math.random() * songs.length)];
}

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

    // -----------------------------------------
    // SLASH COMMANDS
    // -----------------------------------------
    if (type === InteractionType.APPLICATION_COMMAND) {
      const { name, options } = data;
      const context = req.body.context;
      const userId =
        context === 0 ? req.body.member?.user?.id : req.body.user?.id;

      // TEST
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

      // CHALLENGE (RPS)
      if (name === "challenge" && id) {
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

      // RULES
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

      // COINFLIP
      if (name === "coinflip") {
        const coinflipCommand = ALL_COMMANDS.find(
          (cmd) => cmd.name === "coinflip"
        );
        if (coinflipCommand) incrementCommandUsage(userId, coinflipCommand);
        const result = Math.random() < 0.5 ? "Heads" : "Tails";
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: `🪙 The coin landed on **${result}**!` },
        });
      }

      // JOKE
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

      // GUESS THE SONG
      if (name === "guesssong") {
        const songGameCommand = ALL_COMMANDS.find(
          (cmd) => cmd.name === "guesssong"
        );
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

      // HANGMAN
      if (name === "hangman") {
        const lengthOption = options?.find((o) => o.name === "number");
        const requestedLength = lengthOption
          ? Number(lengthOption.value)
          : null;
        let word = null;
        if (requestedLength) word = pickWordByLength(requestedLength);
        if (!word) word = pickRandomWord();

        if (!word) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: "Sorry — no words available right now." },
          });
        }

        activeHangmanGames[id] = {
          word,
          guessed: [],
          wrong: 0,
          wrongLetters: [],
          maxWrong: 6,
          host: userId,
        };

        const letters = "abcdefghijklmnopqrstuvwxyz".split("");
        const first = letters
          .slice(0, 13)
          .map((ch) => ({ label: ch.toUpperCase(), value: ch }));
        const second = letters
          .slice(13)
          .map((ch) => ({ label: ch.toUpperCase(), value: ch }));
        const masked = maskWord(word, []);

        const hangmanCmd = ALL_COMMANDS.find((c) => c.name === "hangman");
        if (hangmanCmd) incrementCommandUsage(userId, hangmanCmd);

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: InteractionResponseFlags.IS_COMPONENTS_V2,
            components: [
              {
                type: MessageComponentTypes.TEXT_DISPLAY,
                content: `Hangman started by <@${userId}> — Word: \`${masked}\`  (wrong: 0/6)`,
              },
              {
                type: MessageComponentTypes.ACTION_ROW,
                components: [
                  {
                    type: MessageComponentTypes.STRING_SELECT,
                    custom_id: `hangman_guess_${id}_1`,
                    placeholder: "Guess a letter (A-M)",
                    options: first,
                  },
                ],
              },
              {
                type: MessageComponentTypes.ACTION_ROW,
                components: [
                  {
                    type: MessageComponentTypes.STRING_SELECT,
                    custom_id: `hangman_guess_${id}_2`,
                    placeholder: "Guess a letter (N-Z)",
                    options: second,
                  },
                ],
              },
              {
                type: MessageComponentTypes.ACTION_ROW,
                components: [
                  {
                    type: MessageComponentTypes.BUTTON,
                    custom_id: `hangman_solve_${id}`,
                    label: "Solve",
                    style: ButtonStyleTypes.SECONDARY,
                  },
                ],
              },
            ],
          },
        });
      }

      // HIGHER LOWER
      if (name === "higherlower") {
        const hiloCommand = ALL_COMMANDS.find(
          (cmd) => cmd.name === "higherlower"
        );
        if (hiloCommand) incrementCommandUsage(userId, hiloCommand);

        const deck = shuffleDeck(createDeck());
        const currentCard = deck.pop();
        const nextCard = deck.pop();

        activeHigherLowerGames[userId] = {
          deck,
          currentCard,
          nextCard,
          streak: 0,
        };

        const cardInfo = getCardInfo(currentCard);

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `**Higher or Lower Game Started!**\n\nYour card is: **${cardInfo.name}**\nStreak: 0\nCards left in deck: ${deck.length}\n\nGuess if the next card will be...`,
            components: [
              {
                type: MessageComponentTypes.ACTION_ROW,
                components: [
                  {
                    type: MessageComponentTypes.BUTTON,
                    custom_id: "hilo_higher",
                    label: "Higher",
                    style: ButtonStyleTypes.PRIMARY,
                  },
                  {
                    type: MessageComponentTypes.BUTTON,
                    custom_id: "hilo_lower",
                    label: "Lower",
                    style: ButtonStyleTypes.PRIMARY,
                  },
                ],
              },
              {
                type: MessageComponentTypes.ACTION_ROW,
                components: [
                  {
                    type: MessageComponentTypes.BUTTON,
                    custom_id: "hilo_red",
                    label: "Red",
                    style: ButtonStyleTypes.DANGER,
                  },
                  {
                    type: MessageComponentTypes.BUTTON,
                    custom_id: "hilo_black",
                    label: "Black",
                    style: ButtonStyleTypes.SECONDARY,
                  },
                  {
                    type: MessageComponentTypes.BUTTON,
                    custom_id: "hilo_end",
                    label: "End Game",
                    style: ButtonStyleTypes.SECONDARY,
                  },
                ],
              },
            ],
          },
        });
      }

      // ZODIAC
      if (name === "zodiac") {
        const zodiacCommand = ALL_COMMANDS.find((cmd) => cmd.name === "zodiac");
        if (zodiacCommand) incrementCommandUsage(userId, zodiacCommand);

        const monthOption = options.find((opt) => opt.name === "month");
        const dayOption = options.find((opt) => opt.name === "day");
        const month = monthOption ? monthOption.value : 0;
        const day = dayOption ? dayOption.value : 0;
        const signData = getZodiacSign(month, day);

        if (!signData) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `Invalid date provided (${month}/${day}). Please try again.`,
            },
          });
        }

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `🌌 **Astrology Fact** 🌌\n\n**Sign:** ${signData.sign}\n**Date:** ${month}/${day}\n\n✨ *${signData.fact}*`,
          },
        });
      }

      console.error(`unknown command: ${name}`);
      return res.status(400).json({ error: "unknown command" });
    }

    // -----------------------------------------
    // COMPONENT INTERACTIONS
    // -----------------------------------------
    if (type === InteractionType.MESSAGE_COMPONENT) {
      const componentId = data.custom_id;

      // HANGMAN GUESS
      if (componentId.startsWith("hangman_guess_")) {
        const rest = componentId.substring("hangman_guess_".length);
        const gameId = rest.replace(/_\d+$/, "");
        const game = activeHangmanGames[gameId];
        if (!game)
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: InteractionResponseFlags.EPHEMERAL,
              content: "Game not found.",
            },
          });

        const letter = data.values[0].toLowerCase();
        if (game.guessed.includes(letter)) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: InteractionResponseFlags.EPHEMERAL,
              content: "Already guessed.",
            },
          });
        }
        game.guessed.push(letter);
        if (!game.word.includes(letter)) {
          game.wrongLetters.push(letter.toUpperCase());
          game.wrong++;
        }
        const masked = maskWord(game.word, game.guessed);

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

        const content =
          game.wrong >= game.maxWrong
            ? `☠️ Game over — the word was **${game.word}**`
            : !masked.includes("_")
            ? `🎉 Solved! The word was **${game.word}**`
            : `Hangman — Word: \`${masked}\`  (wrong: ${game.wrong}/${game.maxWrong})`;

        if (game.wrong >= game.maxWrong || !masked.includes("_"))
          delete activeHangmanGames[gameId];

        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: {
            content: content,
            components:
              game.wrong >= game.maxWrong || !masked.includes("_")
                ? []
                : [
                    ...(first.length
                      ? [
                          {
                            type: MessageComponentTypes.ACTION_ROW,
                            components: [
                              {
                                type: MessageComponentTypes.STRING_SELECT,
                                custom_id: `hangman_guess_${gameId}_1`,
                                placeholder: "Guess (A-M)",
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
                                placeholder: "Guess (N-Z)",
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

      // HANGMAN SOLVE BUTTON
      if (componentId.startsWith("hangman_solve_")) {
        const gameId = componentId.replace("hangman_solve_", "");
        return res.send({
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
      }

      // RPS ACCEPT BUTTON
      if (componentId.startsWith("accept_button_")) {
        const gameId = componentId.replace("accept_button_", "");
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/${req.body.message.id}`;
        const actorId = req.body.member?.user?.id ?? req.body.user?.id;
        const challengerId = activeGames[gameId]?.id;

        if (challengerId && actorId === challengerId) {
          // VS COMPUTER
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
          const summary =
            `<@${challengerId}> chose **${challengerChoice}**, ${COMPUTER_NAME} chose **${botChoice}**.\n\n` +
            (whoWon === "p1"
              ? `<@${challengerId}> wins!`
              : whoWon === "p2"
              ? `${COMPUTER_NAME} wins!`
              : `It's a tie!`) +
            `\n\n**Records**\n• <@${challengerId}> — ${cRec.wins}-${cRec.losses}-${cRec.ties}\n• ${COMPUTER_NAME} — ${bRec.wins}-${bRec.losses}-${bRec.ties}`;

          await res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: summary },
          });
          await DiscordRequest(endpoint, { method: "DELETE" });
          delete activeGames[gameId];
          return;
        }

        // VS PLAYER (Ephemeral Select)
        await res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: InteractionResponseFlags.EPHEMERAL,
            content: "What is your object of choice?",
            components: [
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
        return;
      }

      // RPS SELECT CHOICE
      if (componentId.startsWith("select_choice_")) {
        const gameId = componentId.replace("select_choice_", "");
        if (activeGames[gameId]) {
          const userId = req.body.member?.user?.id ?? req.body.user?.id;
          const objectName = data.values[0];
          const challengerId = activeGames[gameId].id;
          const challengerChoice = activeGames[gameId].objectName;
          const whoWon = decideOutcome(challengerChoice, objectName);

          if (whoWon === "p1") {
            bumpRecord(challengerId, "win");
            bumpRecord(userId, "lose");
          } else if (whoWon === "p2") {
            bumpRecord(challengerId, "lose");
            bumpRecord(userId, "win");
          } else {
            bumpRecord(challengerId, "tie");
            bumpRecord(userId, "tie");
          }

          const resultStr = getResult(
            { id: challengerId, objectName: challengerChoice },
            { id: userId, objectName }
          );
          delete activeGames[gameId];
          const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/${req.body.message.id}`;
          await res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: resultStr },
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
        }
      }

      // GUESS SONG SELECT
      if (componentId.startsWith("guesssong_select_")) {
        const gameId = componentId.replace("guesssong_select_", "");
        const selectedIndex = Number(data.values[0]);
        const game = activeSongGames[gameId];
        if (!game)
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: "❌ Game not found or expired." },
          });

        const correctIndex = songs.findIndex(
          (s) => s.title === game.song.title
        );
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

      // HIGHER LOWER BUTTONS
      if (componentId.startsWith("hilo_")) {
        const userId = req.body.member?.user?.id ?? req.body.user?.id;
        const game = activeHigherLowerGames[userId];
        if (!game)
          return res.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: { content: "Game expired/not found.", components: [] },
          });

        const guess = componentId.replace("hilo_", "");
        if (guess === "end") {
          delete activeHigherLowerGames[userId];
          return res.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: {
              content: `Game ended. Final streak: **${game.streak}**!`,
              components: [],
            },
          });
        }

        const currentInfo = getCardInfo(game.currentCard);
        const nextInfo = getCardInfo(game.nextCard);
        let correct = false;
        if (guess === "higher") correct = nextInfo.value > currentInfo.value;
        else if (guess === "lower")
          correct = nextInfo.value < currentInfo.value;
        else if (guess === "red") correct = nextInfo.color === "Red";
        else if (guess === "black") correct = nextInfo.color === "Black";

        if (correct) {
          game.streak++;
          if (game.deck.length === 0) {
            const finalStreak = game.streak;
            delete activeHigherLowerGames[userId];
            return res.send({
              type: InteractionResponseType.UPDATE_MESSAGE,
              data: {
                content: `Correct! The card was **${nextInfo.name}**. Deck finished! 🏆 Final Streak: ${finalStreak}`,
                components: [],
              },
            });
          }
          game.currentCard = game.nextCard;
          game.nextCard = game.deck.pop();
          activeHigherLowerGames[userId] = game;
          const newCurrentInfo = getCardInfo(game.currentCard);
          return res.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: {
              content: `Correct! The card was **${
                nextInfo.name
              }**. ${getRandomEmoji()}\nNew card: **${
                newCurrentInfo.name
              }**\nStreak: ${game.streak}\nGuess next...`,
              components: req.body.message.components,
            },
          });
        } else {
          const finalStreak = game.streak;
          delete activeHigherLowerGames[userId];
          return res.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: {
              content: `Wrong! The card was **${nextInfo.name}**. 😥\nGame over. Final streak: **${finalStreak}**.`,
              components: [],
            },
          });
        }
      }
      return;
    }

    // MODAL SUBMITS (Hangman Solve)
    if (type === InteractionType.MODAL_SUBMIT) {
      const modalId = data.custom_id;
      if (modalId.startsWith("hangman_solve_modal_")) {
        const gameId = modalId.replace("hangman_solve_modal_", "");
        const game = activeHangmanGames[gameId];
        const guess = req.body.data?.components?.[0]?.components?.[0]?.value;

        if (!game || !guess)
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: InteractionResponseFlags.EPHEMERAL,
              content: "Error processing solve.",
            },
          });

        if (guess.trim().toLowerCase() === game.word.toLowerCase()) {
          delete activeHangmanGames[gameId];
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `🎉 <@${
                req.body.member?.user?.id ?? req.body.user?.id
              }> solved it! Word: **${game.word}**`,
            },
          });
        } else {
          game.wrong++;
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: InteractionResponseFlags.EPHEMERAL,
              content: `Incorrect. Wrong: ${game.wrong}/${game.maxWrong}`,
            },
          });
        }
      }
    }

    console.error("unknown interaction type", type);
    return res.status(400).json({ error: "unknown interaction type" });
  }
);

app.listen(PORT, () => {
  console.log("Listening on port", PORT);
});
