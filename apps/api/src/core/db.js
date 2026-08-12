import { config } from "./config.js";
import { MariaDbConnection } from "../infrastructure/database/MariaDbConnection.js";

export { MariaDbConnection };
export const database = new MariaDbConnection(config.db);
export const pool = database;

export async function withTransaction(work) {
  return database.transaction(work);
}
