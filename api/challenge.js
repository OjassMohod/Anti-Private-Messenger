import { randomInt } from "node:crypto";
import { endpoint, HttpError, isUuid } from "../server/http.js";
import { getAdmin, authenticate, checkDatabase } from "../server/database.js";
import { puzzles } from "../server/ciphers.js";

export function createChallengeHandler(deps = {}) {
  return endpoint(async (req, body) => {
    const db = deps.db || getAdmin();
    const sender = await (deps.authenticate || authenticate)(req, db);
    if (!isUuid(body.recipient_id) || body.recipient_id === sender)
      throw new HttpError(400, "Choose another registered user.");
    const cipher = randomInt(2) ? "caesar" : "atbash";
    const { data, error } = await db.rpc("issue_challenge", {
      p_sender_id: sender,
      p_recipient_id: body.recipient_id,
      p_cipher: cipher,
    });
    checkDatabase(error);
    return { id: data.id, expires_at: data.expires_at, ...puzzles[cipher] };
  });
}

export default createChallengeHandler();
