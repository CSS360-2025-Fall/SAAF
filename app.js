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

const winLoss = Object.create(null);
// Create an express app
const app = express();
// Get port, or default to 3000
const PORT = process.env.PORT || 3000;
// To keep track of our active games
const activeGames = {};
const blackjackGames = {};
const tttGames = {};

// -------------------------
// Bot theme and rules
// -------------------------
const BOT_THEME = {
  description: "A fun Discord bot to play quick games like Rock Paper Scissors with friends!",
  rules: [
    "Be respectful to other players.",
    "No spamming buttons or options.",
    "Only use commands in the proper channels.",
    "Have fun and enjoy random surprises 😄",
    "The bot is meant for casual gaming; results are just for fun!"
  ],
  exampleCommands: [
    "/test - Test the bot's response",
    "/challenge <choice> - Start a Rock Paper Scissors game with a friend"
  ]
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

// -------------------------
// Blackjack helpers
// -------------------------
const BJ_SUITS = ["♠", "♥", "♦", "♣"];
const BJ_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function createShuffledDeck() {
  const deck = [];
  for (const suit of BJ_SUITS) {
    for (const rank of BJ_RANKS) {
      deck.push({ rank, suit });
    }
  }
  //shuffle
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

  // Make Aces 1 instead of 11 if we bust
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

//Tic Tac Toe Helper
function makeEmptyBoard(){
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
    const a = line[0];
    const b = line[1];
    const c = line[2];

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
  if (cell === "X") {
    return "X";
  } else if (cell === "O") {
    return "O";
  } else {
    return "▢";
  }
}

function makeTttText(game) {
  const { xPlayerId, oPlayerId, board, currentTurn, winner, isDraw } = game;

  // Convert each cell to emoji
  const row1 = `${cellToSymbol(board[0])} ${cellToSymbol(board[1])} ${cellToSymbol(board[2])}`;
  const row2 = `${cellToSymbol(board[3])} ${cellToSymbol(board[4])} ${cellToSymbol(board[5])}`;
  const row3 = `${cellToSymbol(board[6])} ${cellToSymbol(board[7])} ${cellToSymbol(board[8])}`;

  let header = `**Tic Tac Toe**\nX = <@${xPlayerId}>`;

  if (oPlayerId) {
    header += `\nO = <@${oPlayerId}>`;
  } else {
    header += `\nO = waiting for someone to accept...`;
  }

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

// Make the components (buttons) for the message
function makeTttComponents(gameId, game) {
  const { board, isFinished, oPlayerId } = game;

  // If nobody has accepted yet, only show Accept button
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

  // Otherwise show the 3x3 grid
  const rows = [];

  for (let row = 0; row < 3; row++) {
    const startIndex = row * 3;
    rows.push({
      type: MessageComponentTypes.ACTION_ROW,
      components: [0, 1, 2].map((offset) => {
        const index = startIndex + offset;
        const cell = board[index];

        let label;
        if (cell === "X") {
          label = "X";
        } else if (cell === "O") {
          label = "O";
        } else {
          label = "\u200B";
        }

        let style;
        if (cell === "X") {
          style = ButtonStyleTypes.PRIMARY;
        } else if (cell === "O") {
          style = ButtonStyleTypes.DANGER;
        } else {
          style = ButtonStyleTypes.SECONDARY;
        }

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

      // "challenge" command
      if (name === "challenge" && id) {
        // Interaction context
        const context = req.body.context;
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
                { name: "Example Commands", value: BOT_THEME.exampleCommands.join('\n') }
              ],
              color: 0x00ff00
            }
          ]
        }
      }
    );
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

      //Blackjack
      if (name === "blackjack") {
        // Track usage if you've defined it in ALL_COMMANDS
        const bjCommand = ALL_COMMANDS.find((cmd) => cmd.name === "blackjack");
        if (bjCommand) {
          incrementCommandUsage(userId, bjCommand);
        }

        // Create a new blackjack game for this user
        const game = {
          deck: createShuffledDeck(),
          playerHand: [],
          dealerHand: [],
        };

        // Initial deal: 2 to player, 2 to dealer
        game.playerHand.push(drawCard(game));
        game.playerHand.push(drawCard(game));
        game.dealerHand.push(drawCard(game));
        game.dealerHand.push(drawCard(game));

        blackjackGames[userId] = game;

        const playerTotal = getHandValue(game.playerHand);

        const content =
          `🃏 **Blackjack**\n` +
          `Dealer: ${formatHand(game.dealerHand, true)}\n` + // show dealer's 2nd card only
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

      //Tic Tac Toe
      if (name === "tictactoe") {
        // log usage if you added it in ALL_COMMANDS
        const tttCommand = ALL_COMMANDS.find((cmd) => cmd.name === "tictactoe");
        if (tttCommand) {
          incrementCommandUsage(userId, tttCommand);
        }

        const gameId = id; // use the interaction id as game id

        // create a brand new game
        tttGames[gameId] = {
          xPlayerId: userId,         // the person who ran the command is X
          oPlayerId: null,           // set when someone accepts
          board: makeEmptyBoard(),   // 9 empty cells
          currentTurn: "X",          // X always starts
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



      console.error(`unknown command: ${name}`);
      return res.status(400).json({ error: "unknown command" });
    }

    if (type === InteractionType.MESSAGE_COMPONENT) {
      // custom_id set in payload when sending message component
      const componentId = data.custom_id;

      if (componentId.startsWith("accept_button_")) {
        // get the associated game ID
        const gameId = componentId.replace("accept_button_", "");
        // Delete message with token in request body
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/${req.body.message.id}`;

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
          // Interaction context
          const context = req.body.context;
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
          const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/${req.body.message.id}`;

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
      } else if (
        componentId.startsWith("bj_hit_") ||
        componentId.startsWith("bj_stand_")
      ) {
        const clickerId = req.body.member?.user?.id ?? req.body.user?.id;
        const userIdFromId = componentId.split("_").at(-1); // "bj_hit_<userId>"

        // Prevent other users from messing with your game
        if (userIdFromId !== clickerId) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags:
                InteractionResponseFlags.EPHEMERAL |
                InteractionResponseFlags.IS_COMPONENTS_V2,
              components: [
                {
                  type: MessageComponentTypes.TEXT_DISPLAY,
                  content: "This isn't your blackjack game.",
                },
              ],
            },
          });
        }

        const game = blackjackGames[clickerId];
        if (!game) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags:
                InteractionResponseFlags.EPHEMERAL |
                InteractionResponseFlags.IS_COMPONENTS_V2,
              components: [
                {
                  type: MessageComponentTypes.TEXT_DISPLAY,
                  content:
                    "You don't have an active blackjack game. Use /blackjack to start one.",
                },
              ],
            },
          });
        }

        // Base message title
        let message = "🃏 **Blackjack**\n";

        // ----- HIT -----
        if (componentId.startsWith("bj_hit_")) {
          game.playerHand.push(drawCard(game));

          const playerTotal = getHandValue(game.playerHand);
          const dealerShown = formatHand(game.dealerHand, true);
          const playerHandStr = formatHand(game.playerHand);

          // Player busts
          if (playerTotal > 21) {
            const dealerTotal = getHandValue(game.dealerHand);
            const dealerHandStr = formatHand(game.dealerHand);

            message +=
              `Dealer: ${dealerHandStr} (Total: ${dealerTotal})\n` +
              `You: ${playerHandStr} (Total: ${playerTotal})\n\n` +
              `💥 You busted! Dealer wins.`;

            delete blackjackGames[clickerId];

            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                flags:
                  InteractionResponseFlags.EPHEMERAL |
                  InteractionResponseFlags.IS_COMPONENTS_V2,
                components: [
                  {
                    type: MessageComponentTypes.TEXT_DISPLAY,
                    content: message,
                  },
                ],
              },
            });
          }

          // Still in game
          message +=
            `Dealer: ${dealerShown}\n` +
            `You: ${playerHandStr} (Total: ${playerTotal})\n\n` +
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
                  content: message,
                },
                {
                  type: MessageComponentTypes.ACTION_ROW,
                  components: [
                    {
                      type: MessageComponentTypes.BUTTON,
                      custom_id: `bj_hit_${clickerId}`,
                      label: "Hit",
                      style: ButtonStyleTypes.PRIMARY,
                    },
                    {
                      type: MessageComponentTypes.BUTTON,
                      custom_id: `bj_stand_${clickerId}`,
                      label: "Stand",
                      style: ButtonStyleTypes.SECONDARY,
                    },
                  ],
                },
              ],
            },
          });
        }

        // ----- STAND -----
        if (componentId.startsWith("bj_stand_")) {
          // Dealer draws to 17+
          while (getHandValue(game.dealerHand) < 17) {
            game.dealerHand.push(drawCard(game));
          }

          const playerTotal = getHandValue(game.playerHand);
          const dealerTotal = getHandValue(game.dealerHand);
          const playerHandStr = formatHand(game.playerHand);
          const dealerHandStr = formatHand(game.dealerHand);

          let outcome;
          if (dealerTotal > 21 || playerTotal > dealerTotal) {
            outcome = "You win!";
          } else if (dealerTotal === playerTotal) {
            outcome = "It's a push.";
          } else {
            outcome = "Dealer wins.";
          }

          message +=
            `Dealer: ${dealerHandStr} (Total: ${dealerTotal})\n` +
            `You: ${playerHandStr} (Total: ${playerTotal})\n\n` +
            outcome;

          delete blackjackGames[clickerId];

          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags:
                InteractionResponseFlags.EPHEMERAL |
                InteractionResponseFlags.IS_COMPONENTS_V2,
              components: [
                {
                  type: MessageComponentTypes.TEXT_DISPLAY,
                  content: message,
                },
              ],
            },
          });
        }

      }      // Someone clicked "Accept" on Tic Tac Toe
      else if (componentId.startsWith("ttt_accept_")) {
        const gameId = componentId.replace("ttt_accept_", "");
        const game = tttGames[gameId];

        const clickerId = req.body.member?.user?.id ?? req.body.user?.id;

        if (!game) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags:
                InteractionResponseFlags.EPHEMERAL |
                InteractionResponseFlags.IS_COMPONENTS_V2,
              components: [
                {
                  type: MessageComponentTypes.TEXT_DISPLAY,
                  content: "This Tic Tac Toe game could not be found.",
                },
              ],
            },
          });
        }

        // Challenger can't accept their own challenge
        if (clickerId === game.xPlayerId) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags:
                InteractionResponseFlags.EPHEMERAL |
                InteractionResponseFlags.IS_COMPONENTS_V2,
              components: [
                {
                  type: MessageComponentTypes.TEXT_DISPLAY,
                  content: "You can't accept your own Tic Tac Toe challenge.",
                },
              ],
            },
          });
        }

        // If already has an opponent and it's not the same person
        if (game.oPlayerId && game.oPlayerId !== clickerId) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags:
                InteractionResponseFlags.EPHEMERAL |
                InteractionResponseFlags.IS_COMPONENTS_V2,
              components: [
                {
                  type: MessageComponentTypes.TEXT_DISPLAY,
                  content: "This Tic Tac Toe game already has two players.",
                },
              ],
            },
          });
        }

        // Set O player and update message to show the board
        game.oPlayerId = clickerId;

        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: {
            content: makeTttText(game),
            components: makeTttComponents(gameId, game),
          },
        });
      }
      else if (componentId.startsWith("ttt_move_")) {
        const clickerId = req.body.member?.user?.id ?? req.body.user?.id;

        const parts = componentId.split("_"); // ['ttt', 'move', gameId, index]
        const gameId = parts[2];
        const cellIndex = Number(parts[3]);

        const game = tttGames[gameId];

        if (!game) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags:
                InteractionResponseFlags.EPHEMERAL |
                InteractionResponseFlags.IS_COMPONENTS_V2,
              components: [
                {
                  type: MessageComponentTypes.TEXT_DISPLAY,
                  content: "This Tic Tac Toe game no longer exists.",
                },
              ],
            },
          });
        }

        // Only X and O can play
        if (clickerId !== game.xPlayerId && clickerId !== game.oPlayerId) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags:
                InteractionResponseFlags.EPHEMERAL |
                InteractionResponseFlags.IS_COMPONENTS_V2,
              components: [
                {
                  type: MessageComponentTypes.TEXT_DISPLAY,
                  content: "You're not a player in this Tic Tac Toe game.",
                },
              ],
            },
          });
        }

        if (game.isFinished) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags:
                InteractionResponseFlags.EPHEMERAL |
                InteractionResponseFlags.IS_COMPONENTS_V2,
              components: [
                {
                  type: MessageComponentTypes.TEXT_DISPLAY,
                  content: "This Tic Tac Toe game is already finished.",
                },
              ],
            },
          });
        }

        // Figure out if this player is X or O
        let marker;
        if (clickerId === game.xPlayerId) {
          marker = "X";
        } else {
          marker = "O";
        }

        // Check turn
        if (marker !== game.currentTurn) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags:
                InteractionResponseFlags.EPHEMERAL |
                InteractionResponseFlags.IS_COMPONENTS_V2,
              components: [
                {
                  type: MessageComponentTypes.TEXT_DISPLAY,
                  content: "It's not your turn.",
                },
              ],
            },
          });
        }

        // Check index
        if (Number.isNaN(cellIndex) || cellIndex < 0 || cellIndex > 8) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags:
                InteractionResponseFlags.EPHEMERAL |
                InteractionResponseFlags.IS_COMPONENTS_V2,
              components: [
                {
                  type: MessageComponentTypes.TEXT_DISPLAY,
                  content: "Invalid move.",
                },
              ],
            },
          });
        }

        // Check if cell already used
        if (game.board[cellIndex] !== null) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags:
                InteractionResponseFlags.EPHEMERAL |
                InteractionResponseFlags.IS_COMPONENTS_V2,
              components: [
                {
                  type: MessageComponentTypes.TEXT_DISPLAY,
                  content: "That spot is already taken.",
                },
              ],
            },
          });
        }

        // Place the move
        game.board[cellIndex] = marker;

        // Check for winner / draw
        const win = checkTttWinner(game.board);
        if (win) {
          game.isFinished = true;
          game.winner = win;
        } else if (isBoardFull(game.board)) {
          game.isFinished = true;
          game.isDraw = true;
        } else {
          // Switch turn
          if (game.currentTurn === "X") {
            game.currentTurn = "O";
          } else {
            game.currentTurn = "X";
          }
        }

        // Update original message with new board
        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: {
            content: makeTttText(game),
            components: makeTttComponents(gameId, game),
          },
        });
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
