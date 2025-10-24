import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import serviceAccount from "../saaf-db-firebase-adminsdk-key.json" with {type: "json"};

initializeApp({
  credential: cert(serviceAccount),
});

export const db = getFirestore();
