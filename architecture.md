# Architectural Guide

## Project Structure

## Ngrok

## Node.js

We use **Node.js** as our **Javascript runtime** both in testing and production. Node allows for developers to use Javascript (and its supersets, such as Typescript) outside of their typical browser environment. For better or worse, this allows developers to use a comfortable language on both the frontend and the server. For our use-case, Javascript is convenient as it has many quality of life features for working on the web with **APIs** and **asynchronous code**. Because almost all of our functionality has to interact with the **Discord API**, these features can improve development speed and readability. Additionally, Node comes hand-in-hand with the most popular package manager among modern programming languages, **npm** (Node package manager). npm allows for developers to install, version control, and manage **dependencies** for a project with ease, and contains packages for almost any scenario/API you can think of. For our case, that allows us to quickly pull in first-party support for the Discord.js API, or the firebase API, allowing for **rapid development on thoroughly battle-tested platforms**.

## Testing Strategy
