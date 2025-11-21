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
// Updated import to include new game functions
import { getShuffledOptions, getResult, createDeck, shuffleDeck, getCardInfo } from "./game.js";
import { incrementCommandUsage } from "./db/commandUsage.js";
import { ALL_COMMANDS } from "./commands.js";

const winLoss = Object.create(null);
// Create an express app
const app = express();
// Get port, or default to 3000
const PORT = process.env.PORT || 3000;
// To keep track of our active games
const activeGames = {};
// Added state for higher/lower games
const activeHigherLowerGames = {};

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
      });
      } 

      // --- JOKE COMMAND LOGIC (from your file) ---
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
      // --- END OF JOKE LOGIC ---

      // --- NEW HIGHER/LOWER COMMAND LOGIC ---
      if (name === "higherlower") {
        // Find the command to pass to increment
        const hiloCommand = ALL_COMMANDS.find((cmd) => cmd.name === "higherlower");
        if (hiloCommand) {
          incrementCommandUsage(userId, hiloCommand);
        }

        // Create and shuffle a new deck
        const deck = shuffleDeck(createDeck());
        // Draw the first two cards
        const currentCard = deck.pop();
        const nextCard = deck.pop();

        // Store the game state, keyed by user ID
        activeHigherLowerGames[userId] = {
          deck,
          currentCard,
          nextCard,
          streak: 0
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
                    style: ButtonStyleTypes.PRIMARY, // Blue
                  },
                  {
                    type: MessageComponentTypes.BUTTON,
                    custom_id: "hilo_lower",
                    label: "Lower",
                    style: ButtonStyleTypes.PRIMARY, // Blue
                  },
                ]
              },
              {
                type: MessageComponentTypes.ACTION_ROW,
                components: [
                  {
                    type: MessageComponentTypes.BUTTON,
                    custom_id: "hilo_red",
                    label: "Red",
                    style: ButtonStyleTypes.DANGER, // Red
                  },
                  {
                    type: MessageComponentTypes.BUTTON,
                    custom_id: "hilo_black",
                    label: "Black",
                    style: ButtonStyleTypes.SECONDARY, // Gray
                  },
                  {
                    type: MessageComponentTypes.BUTTON,
                    custom_id: "hilo_end",
                    label: "End Game",
                    style: ButtonStyleTypes.SECONDARY, // Gray
                  }
                ]
              }
            ]
          }
        });
      }
      // --- END OF HIGHER/LOWER LOGIC ---

      console.error(`unknown command: ${name}`);
      return res.status(400).json({ error: "unknown command" });
    } // <-- *** THIS IS THE CORRECT closing brace for 'if (type === InteractionType.APPLICATION_COMMAND)' ***

    /**
     * Handle message component requests
     * See https://discord.com/developers/docs/interactions/message-components#component-object
     */
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
              `• ${COMPUTER_NAME} — ${bRec.wins}-${bRec.losses}-${cRec.ties}`;

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
      } 
      // --- NEW HIGHER/LOWER BUTTON LOGIC ---
      else if (componentId.startsWith("hilo_")) {
        const userId = req.body.member?.user?.id ?? req.body.user?.id;
        const game = activeHigherLowerGames[userId];

        // Check if game exists for this user
        if (!game) {
          return res.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: {
              content: "This game has expired or was not found. Please start a new one with `/higherlower`.",
              components: [] // Remove buttons
            }
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
              components: [] // Remove buttons
            }
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
                components: []
              }
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
              content: `You guessed **${guess}**... The card was **${nextInfo.name}**. **You were right!** ${getRandomEmoji()}\n\nYour new card is: **${newCurrentInfo.name}**\nStreak: ${game.streak}\nCards left in deck: ${game.deck.length}\n\nGuess if the next card will be...`,
              components: req.body.message.components // Re-send the original buttons
            }
          });

        } else {
          // --- Handle Incorrect Guess ---
          const finalStreak = game.streak;
          delete activeHigherLowerGames[userId]; // Clean up game

          return res.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: {
              content: `You guessed **${guess}**... The card was **${nextInfo.name}**. **You were wrong!** 😥\n\nGame over. Your final streak was: **${finalStreak}**.`,
              components: [] // Remove buttons
            }
          });
        }
      }
      // --- END OF HILO BUTTON LOGIC ---

      return;
    } // <-- Closing brace for 'if (type === InteractionType.MESSAGE_COMPONENT)'

    console.error("unknown interaction type", type);
    return res.status(400).json({ error: "unknown interaction type" });
  }
);

app.listen(PORT, () => {
  console.log("Listening on port", PORT);
});