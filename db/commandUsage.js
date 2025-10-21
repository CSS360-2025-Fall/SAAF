import { db } from "./db.js";
import { ALL_COMMANDS } from "../commands.js";
import { FieldValue } from "firebase-admin/firestore";

export async function incrementCommandUsage(userID, command) {
  if (
    !command.hasOwnProperty("name") ||
    !command.hasOwnProperty("contexts") ||
    !ALL_COMMANDS.includes(command)
  ) {
    throw new Error(
      "command argument must be from the ALL_COMMANDS array provided in commands.js"
    );
  }

  const targetUser = db.collection("users").doc(userID);
  let fetchedUser = await targetUser.get();
  if (!fetchedUser.exists) {
    await targetUser.set({
      userID: userID,
      [command.name]: {
        usages: 0,
      },
    });
    fetchedUser = targetUser.get();
  }

  await targetUser.update({
    [`${command.name}.usages`]: FieldValue.increment(1),
  });
}
