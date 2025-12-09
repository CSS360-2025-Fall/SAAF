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

// -------------------------
// Base game states
// -------------------------
const activeGames = {}; // RPS challenges
const blackjackGames = {}; // Your blackjack
const tttGames = {}; // Your tic tac toe

// Main branch game states
const activeHangmanGames = {};
// TypeRace games
const activeTypeRaces = {};
const activeHigherLowerGames = {};
const activeSongGames = {};

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

// -------------------------
// /joke data
// -------------------------
const jokes = [
  "Why do JavaScript developers wear glasses? Because they don't C#!",
  "What's the object-oriented way to become wealthy? Inheritance.",
  "Why did the programmer quit his job? Because he didn't get arrays.",
];

// -------------------------
// Guess the Song data
// -------------------------
const SONGS_BY_GENRE = {
  rock: [
    { title: "Bohemian Rhapsody - Queen", emojis: "🎤👑🎶" },
    { title: "Stairway to Heaven - Led Zeppelin", emojis: "🎸🌌🕊️" },
    { title: "Smells Like Teen Spirit - Nirvana", emojis: "🎸🌀🔥" },
    { title: "Hotel California - Eagles", emojis: "🏨🌴🌅" },
    { title: "Sweet Child O' Mine - Guns N' Roses", emojis: "🌹🎸👧" },
  ],
  pop: [
    { title: "Bad Romance - Lady Gaga", emojis: "🧛‍♀️💋🔥" },
    { title: "Shake It Off - Taylor Swift", emojis: "💃🎶✨" },
    { title: "Blinding Lights - The Weeknd", emojis: "🌃🚗💡" },
    { title: "Billie Jean - Michael Jackson", emojis: "🕺🎵🌙" },
    { title: "Firework - Katy Perry", emojis: "🎆💥🌈" },
  ],
  hiphop: [
    { title: "Sicko Mode - Travis Scott", emojis: "🌪️🔥🎧" },
    { title: "God's Plan - Drake", emojis: "🙏💙🎵" },
    { title: "Lose Yourself - Eminem", emojis: "🎤⚡🍝" },
    { title: "Stronger - Kanye West", emojis: "💪🎹🎧" },
    { title: "Empire State of Mind - Jay-Z & Alicia Keys", emojis: "🗽🌃🎶" },
  ],
};

function getRandomSongFromGenre(genre) {
  const list = SONGS_BY_GENRE[genre] || SONGS_BY_GENRE["pop"];
  return list[Math.floor(Math.random() * list.length)];
}

const COMPUTER_ID = "RPS_COMPUTER";
const COMPUTER_NAME = "Computer";

function randomRps() {
  const opts = ["rock", "paper", "scissors"];
  return opts[Math.floor(Math.random() * opts.length)];
}

// -------------------------
// Win/Loss helpers
// -------------------------
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

// -------------------------
// Blackjack helpers
// -------------------------
const BJ_SUITS = ["♠", "♥", "♦", "♣"];
const BJ_RANKS = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];

function createShuffledDeck() {
  const deck = [];
  for (const suit of BJ_SUITS) {
    for (const rank of BJ_RANKS) {
      deck.push({ rank, suit });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function drawCard(game) {
  return game.deck.pop();
}

function getHandValue(hand) {
  let total = 0;
  let aces = 0;

  for (const card of hand) {
    if (card.rank === "A") {
      total += 11;
      aces += 1;
    } else if (["K", "Q", "J"].includes(card.rank)) {
      total += 10;
    } else {
      total += Number(card.rank);
    }
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }

  return total;
}

function formatHand(hand, hideFirst = false) {
  if (!hand || hand.length === 0) return "(no cards)";

  if (hideFirst && hand.length > 0) {
    const [, ...rest] = hand;
    return `🂠 ${rest.map((c) => `${c.rank}${c.suit}`).join(" ")}`;
  }

  return hand.map((c) => `${c.rank}${c.suit}`).join(" ");
}

// -------------------------
// TicTacToe helpers
// -------------------------
function makeEmptyBoard() {
  return Array(9).fill(null);
}

const TTT_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function checkTttWinner(board) {
  for (const line of TTT_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[b] === board[c]) {
      return board[a];
    }
  }
  return null;
}

function isBoardFull(board) {
  return board.every((cell) => cell !== null);
}

function cellToSymbol(cell) {
  if (cell === "X") return "X";
  if (cell === "O") return "O";
  return "▢";
}

function makeTttText(game) {
  const { xPlayerId, oPlayerId, board, currentTurn, winner, isDraw } = game;

  const row1 = `${cellToSymbol(board[0])} ${cellToSymbol(
    board[1]
  )} ${cellToSymbol(board[2])}`;
  const row2 = `${cellToSymbol(board[3])} ${cellToSymbol(
    board[4]
  )} ${cellToSymbol(board[5])}`;
  const row3 = `${cellToSymbol(board[6])} ${cellToSymbol(
    board[7]
  )} ${cellToSymbol(board[8])}`;

  let header = `**Tic Tac Toe**\nX = <@${xPlayerId}>`;

  if (oPlayerId) header += `\nO = <@${oPlayerId}>`;
  else header += `\nO = waiting for someone to accept...`;

  if (winner) {
    const winnerId = winner === "X" ? xPlayerId : oPlayerId;
    header += `\n\n <@${winnerId}> (${winner}) wins!`;
  } else if (isDraw) {
    header += `\n\n It's a draw!`;
  } else if (oPlayerId) {
    const currentPlayerId = currentTurn === "X" ? xPlayerId : oPlayerId;
    header += `\n\nIt's <@${currentPlayerId}>'s turn (${currentTurn}).`;
  } else {
    header += `\n\nPress **Accept** to join the game.`;
  }

  return `${header}\n\n${row1}\n${row2}\n${row3}`;
}

function makeTttComponents(gameId, game) {
  const { board, isFinished, oPlayerId } = game;

  if (!oPlayerId) {
    return [
      {
        type: MessageComponentTypes.ACTION_ROW,
        components: [
          {
            type: MessageComponentTypes.BUTTON,
            custom_id: `ttt_accept_${gameId}`,
            label: "Accept",
            style: ButtonStyleTypes.PRIMARY,
          },
        ],
      },
    ];
  }

  const rows = [];
  for (let row = 0; row < 3; row++) {
    const startIndex = row * 3;
    rows.push({
      type: MessageComponentTypes.ACTION_ROW,
      components: [0, 1, 2].map((offset) => {
        const index = startIndex + offset;
        const cell = board[index];

        let label = "\u200B";
        if (cell === "X") label = "X";
        else if (cell === "O") label = "O";

        let style = ButtonStyleTypes.SECONDARY;
        if (cell === "X") style = ButtonStyleTypes.PRIMARY;
        else if (cell === "O") style = ButtonStyleTypes.DANGER;

        return {
          type: MessageComponentTypes.BUTTON,
          custom_id: `ttt_move_${gameId}_${index}`,
          label,
          style,
          disabled: isFinished || cell !== null,
        };
      }),
    });
  }

  return rows;
}

// -------------------------
// Interactions endpoint
// -------------------------
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

      // "typerace" command
      if (name === "typerace") {
        const gameId = id;
        const passage = (await import("./typerace.js")).pickPassage();
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
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: InteractionResponseFlags.EPHEMERAL,
              content: "No text provided.",
            },
          });
        }

        // find game: use provided game id or search for active race in same channel
        let game = null;
        if (providedGame) game = activeTypeRaces[providedGame];
        else {
          game = Object.values(activeTypeRaces).find(
            (g) => g.channelId === req.body.channel_id && g.startTime
          );
        }

        if (!game) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: InteractionResponseFlags.EPHEMERAL,
              content: "No active race found in this channel.",
            },
          });
        }

        const submitTime = Date.now();
        const elapsed = Math.max(
          0,
          submitTime - (game.startTime || submitTime)
        );
        const { computeStats } = await import("./typerace.js");
        const stats = computeStats(game.passage, typed, elapsed);

        game.results.push({ userId: callerId, ...stats });

        // respond to the submitter with their stats
        const rank =
          game.results
            .slice()
            .sort((a, b) => b.netWPM - a.netWPM)
            .findIndex((r) => r.userId === callerId) + 1;
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: InteractionResponseFlags.EPHEMERAL,
            content: `Submission recorded — ${
              stats.netWPM
            } WPM (accuracy ${Math.round(
              stats.accuracy * 100
            )}%). Current rank: ${rank}`,
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

      // BLACKJACK (yours)
      if (name === "blackjack") {
        const bjCommand = ALL_COMMANDS.find((cmd) => cmd.name === "blackjack");
        if (bjCommand) incrementCommandUsage(userId, bjCommand);

        const game = {
          deck: createShuffledDeck(),
          playerHand: [],
          dealerHand: [],
        };

        game.playerHand.push(drawCard(game));
        game.playerHand.push(drawCard(game));
        game.dealerHand.push(drawCard(game));
        game.dealerHand.push(drawCard(game));

        blackjackGames[userId] = game;

        const playerTotal = getHandValue(game.playerHand);

        const content =
          `🃏 **Blackjack**\n` +
          `Dealer: ${formatHand(game.dealerHand, true)}\n` +
          `You: ${formatHand(game.playerHand)} (Total: ${playerTotal})\n\n` +
          `Hit or Stand?`;

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags:
              InteractionResponseFlags.EPHEMERAL |
              InteractionResponseFlags.IS_COMPONENTS_V2,
            components: [
              {
                type: MessageComponentTypes.TEXT_DISPLAY,
                content,
              },
              {
                type: MessageComponentTypes.ACTION_ROW,
                components: [
                  {
                    type: MessageComponentTypes.BUTTON,
                    custom_id: `bj_hit_${userId}`,
                    label: "Hit",
                    style: ButtonStyleTypes.PRIMARY,
                  },
                  {
                    type: MessageComponentTypes.BUTTON,
                    custom_id: `bj_stand_${userId}`,
                    label: "Stand",
                    style: ButtonStyleTypes.SECONDARY,
                  },
                ],
              },
            ],
          },
        });
      }

      // TIC TAC TOE (yours)
      if (name === "tictactoe") {
        const tttCommand = ALL_COMMANDS.find((cmd) => cmd.name === "tictactoe");
        if (tttCommand) incrementCommandUsage(userId, tttCommand);

        const gameId = id;

        tttGames[gameId] = {
          xPlayerId: userId,
          oPlayerId: null,
          board: makeEmptyBoard(),
          currentTurn: "X",
          isFinished: false,
          winner: null,
          isDraw: false,
        };

        const game = tttGames[gameId];

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: makeTttText(game),
            components: makeTttComponents(gameId, game),
          },
        });
      }

      // GUESS THE SONG WITH GENRES (Slash Command)
      if (name === "guesssong") {
        const songGameCommand = ALL_COMMANDS.find(
          (cmd) => cmd.name === "guesssong"
        );
        if (songGameCommand) incrementCommandUsage(userId, songGameCommand);

        // Step 1: Ask for genre
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: InteractionResponseFlags.IS_COMPONENTS_V2,
            components: [
              {
                type: MessageComponentTypes.TEXT_DISPLAY,
                content: `🎵 **Guess the Song!**\nChoose a genre to get started.`,
              },
              {
                type: MessageComponentTypes.ACTION_ROW,
                components: [
                  {
                    type: MessageComponentTypes.STRING_SELECT,
                    custom_id: `guesssong_genre_${id}`,
                    placeholder: "Choose a genre",
                    options: [
                      { label: "Rock", value: "rock" },
                      { label: "Pop", value: "pop" },
                      { label: "Hip-Hop", value: "hiphop" },
                    ],
                  },
                ],
              },
            ],
          },
        });
      }

      // HIGHER LOWER (main)
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

      // ZODIAC (main)
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

        const randomFact =
          signData.facts[Math.floor(Math.random() * signData.facts.length)];

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `🌌 **Astrology Fact** 🌌\n\n**Sign:** ${signData.sign}\n**Date:** ${month}/${day}\n\n✨ *${randomFact}*`,
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
      // FIX: Define userId here once for ALL component interactions
      const userId = req.body.member?.user?.id ?? req.body.user?.id;

      // HANGMAN GUESS (main)
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
        console.log("Adding letter? " + game.wrongLetters);

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
            : `Hangman — Word: \`${masked}\` (wrong: ${game.wrong}/${
                game.maxWrong
              }${
                game.wrongLetters.length
                  ? " — wrong letters/guesses: " + game.wrongLetters.join(", ")
                  : ""
              })`;

        if (game.wrong >= game.maxWrong || !masked.includes("_"))
          delete activeHangmanGames[gameId];

        const responsePayload = {
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: {
            // ✅ Use Components V2 format with TEXT_DISPLAY
            flags: InteractionResponseFlags.IS_COMPONENTS_V2,
            components:
              game.wrong >= game.maxWrong || !masked.includes("_")
                ? [
                    {
                      type: MessageComponentTypes.TEXT_DISPLAY,
                      content: content,
                    },
                  ]
                : [
                    {
                      type: MessageComponentTypes.TEXT_DISPLAY,
                      content: content,
                    },
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
        };

        try {
          await res.send(responsePayload);
          return;
        } catch (err) {
          console.error("[hangman_guess] res.send error:", err);
          return;
        }
      }

      // HANGMAN SOLVE BUTTON (main)
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

      // RPS ACCEPT BUTTON (MERGED: your records + main flow)
      if (componentId.startsWith("accept_button_")) {
        const gameId = componentId.replace("accept_button_", "");
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/${req.body.message.id}`;

        const actorId = req.body.member?.user?.id ?? req.body.user?.id;
        const challengerId = activeGames[gameId]?.id;

        // VS COMPUTER
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
            console.error("Self-accept (vs Computer) flow error:", err);
          }
        }

        // VS PLAYER (Ephemeral Select)
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
        return;
      }

      // RPS SELECT CHOICE (MERGED: your records)
      if (componentId.startsWith("select_choice_")) {
        const gameId = componentId.replace("select_choice_", "");
        if (activeGames[gameId]) {
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

          const cRec = winLoss[challengerId] ?? { wins: 0, losses: 0, ties: 0 };
          const oRec = winLoss[opponentId] ?? { wins: 0, losses: 0, ties: 0 };

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

      // GUESS SONG GENRE SELECTION
      if (componentId.startsWith("guesssong_genre_")) {
        const gameId = componentId.replace("guesssong_genre_", "");
        const genre = data.values[0];
        const song = getRandomSongFromGenre(genre);

        // userId is already defined at the top of the COMPONENT block
        activeSongGames[gameId] = { userId, song };

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: InteractionResponseFlags.IS_COMPONENTS_V2,
            components: [
              {
                type: MessageComponentTypes.TEXT_DISPLAY,
                content: `🎵 Genre: **${genre.toUpperCase()}**\nGuess the song from these emojis: ${
                  song.emojis
                }`,
              },
              {
                type: MessageComponentTypes.ACTION_ROW,
                components: [
                  {
                    type: MessageComponentTypes.STRING_SELECT,
                    custom_id: `guesssong_select_${gameId}`,
                    placeholder: "Select the song name",
                    options: SONGS_BY_GENRE[genre].map((s) => ({
                      label: s.title,
                      value: s.title,
                    })),
                  },
                ],
              },
            ],
          },
        });
      }

      // GUESS SONG SELECT
      if (componentId.startsWith("guesssong_select_")) {
        const gameId = componentId.replace("guesssong_select_", "");
        const selectedTitle = data.values[0];
        const game = activeSongGames[gameId];

        if (!game) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: "❌ Game not found or expired." },
          });
        }

        const isCorrect = selectedTitle === game.song.title;
        const message = isCorrect
          ? `🎉 Correct! The song was **${game.song.title}**`
          : `❌ Wrong! The correct answer was **${game.song.title}**`;

        delete activeSongGames[gameId];
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: message },
        });
      }

      // HIGHER LOWER BUTTONS (main)
      if (componentId.startsWith("hilo_")) {
        // userId is already defined at top of block
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
              }**\nStreak: ${game.streak}\nCards left in deck: ${
                game.deck.length
              }\nGuess next...`,
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

    // -----------------------------------------
    // MODAL SUBMITS (Hangman Solve)
    // -----------------------------------------
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
