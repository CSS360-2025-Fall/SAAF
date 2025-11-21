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
} from "./game.js";
import { incrementCommandUsage } from "./db/commandUsage.js";
import { ALL_COMMANDS } from "./commands.js";

const winLoss = Object.create(null);
const app = express();
const PORT = process.env.PORT || 3000;
const activeGames = {};
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

    if (type === InteractionType.APPLICATION_COMMAND) {
      const { name, options } = data;
      const context = req.body.context;
      const userId = context === 0 ? req.body.member.user.id : req.body.user.id;

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

        activeGames[id] = {
          id: userId,
          objectName,
        };

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

      // JOKE COMMAND
      if (name === "joke") {
        const jokeCommand = ALL_COMMANDS.find((cmd) => cmd.name === "joke");
        if (jokeCommand) incrementCommandUsage(userId, jokeCommand);

        let jokeContent;
        const choiceOption = options?.find((opt) => opt.name === "number");

        if (choiceOption) {
          const choice = choiceOption.value;
          if (choice >= 1 && choice <= jokes.length) {
            jokeContent = `Joke #${choice}: ${jokes[choice - 1]}`;
          } else {
            jokeContent = `Sorry, I only have ${jokes.length} jokes. Please pick a number between 1 and ${jokes.length}.`;
          }
        } else {
          const randomIndex = Math.floor(Math.random() * jokes.length);
          jokeContent = jokes[randomIndex];
        }

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: jokeContent },
        });
      }

      // HIGHER LOWER COMMAND
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

      // ZODIAC COMMAND
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

    // MESSAGE COMPONENTS (BUTTONS & SELECTS)
    if (type === InteractionType.MESSAGE_COMPONENT) {
      const componentId = data.custom_id;

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
              `• ${COMPUTER_NAME} — ${bRec.wins}-${bRec.losses}-${cRec.ties}`;

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

        // NORMAL TWO PLAYER PATH (This was the broken part!)
        try {
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
      } else if (componentId.startsWith("hilo_")) {
        const userId = req.body.member?.user?.id ?? req.body.user?.id;
        const game = activeHigherLowerGames[userId];

        if (!game) {
          return res.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: {
              content:
                "This game has expired or was not found. Please start a new one with `/higherlower`.",
              components: [],
            },
          });
        }

        const guess = componentId.replace("hilo_", "");

        if (guess === "end") {
          const finalStreak = game.streak;
          delete activeHigherLowerGames[userId];
          return res.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: {
              content: `Game ended. Your final streak was: **${finalStreak}**!`,
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
                content: `You guessed **${guess}**... The card was **${nextInfo.name}**. **You were right!**\n\n...and you finished the whole deck! 🏆\n**FINAL STREAK: ${finalStreak}**`,
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
              content: `You guessed **${guess}**... The card was **${nextInfo.name}**. **You were right!** ${getRandomEmoji()}\n\nYour new card is: **${newCurrentInfo.name}**\nStreak: ${game.streak}\nCards left in deck: ${game.deck.length}\n\nGuess if the next card will be...`,
              components: req.body.message.components,
            },
          });
        } else {
          const finalStreak = game.streak;
          delete activeHigherLowerGames[userId];

          return res.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: {
              content: `You guessed **${guess}**... The card was **${nextInfo.name}**. **You were wrong!** 😥\n\nGame over. Your final streak was: **${finalStreak}**.`,
              components: [],
            },
          });
        }
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