# Architectural Guide

**[Our Architecture Diagram](https://github.com/CSS360-2025-Fall/SAAF/blob/20e11ea9162876c9a13c854384a747808e2be3e4/architecture.png)**

## Project Structure
This project uses several files that make the Discord bot work smoothly. app.js runs the **Express server, handles commands** like /test, /challenge, and /joke, and manages active games. commands.js sets up and **registers** the bot’s **slash commands** so users can use them in chats. game.js runs the Rock-Paper-Scissors-style **game logic** and decides the winner. utils.js holds **helper functions** like sending API requests, registering commands, and formatting text. The .env file safely stores **secret info** like the bot token and app ID. package-lock.json keeps **dependency versions** consistent, while package.json lists the bot’s setup, **libraries**, and scripts. Lastly, renovate.json controls automatic dependency updates.

## Ngrok

**Ngrok** is an **indispensable** development **tool** that directly enables our bot's entire **system architecture** by creating a secure "**tunnel**" from the **public internet** to our app.js server, which is running privately on our **localhost:3000**. It works by generating a unique, temporary **public URL** (like https://random.ngrok.io) that we **register** with Discord as our single "**Interactions Endpoint**." When a user runs a command like /joke, **Discord's servers** send an **HTTP POST request** to that public ngrok URL, which ngrok instantly and securely **forwards** to our local app.js server's **/interactions** endpoint. This is absolutely **essential** because Discord's public servers cannot otherwise access localhost. The **primary benefit** is **rapid development**: this **bridge** allows our **local code** to **receive real, live events** from Discord, letting us test our changes **immediately** in the app **without having to deploy** our entire project to a **live web server** every time we fix a bug or add a feature.

## Node.js

We use **Node.js** as our **Javascript runtime** both in testing and production. Node allows for developers to use Javascript (and its supersets, such as Typescript) outside of their typical browser environment. For better or worse, this allows developers to use a comfortable language on both the frontend and the server. For our use-case, Javascript is convenient as it has many quality of life features for working on the web with **APIs** and **asynchronous code**. Because almost all of our functionality has to interact with the **Discord API**, these features can improve development speed and readability. Additionally, Node comes hand-in-hand with the most popular package manager among modern programming languages, **npm** (Node package manager). npm allows for developers to install, version control, and manage **dependencies** for a project with ease, and contains packages for almost any scenario/API you can think of. For our case, that allows us to quickly pull in first-party support for the Discord.js API, or the firebase API, allowing for **rapid development on thoroughly battle-tested platforms**.

## Testing Strategy
