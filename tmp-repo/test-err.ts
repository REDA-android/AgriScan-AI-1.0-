import { FirebaseError } from "firebase/app";
const e = new FirebaseError("permission-denied", "Missing or insufficient permissions.");
console.log(JSON.stringify(e));
