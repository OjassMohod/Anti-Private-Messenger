import { endpoint, HttpError, isUuid } from "../server/http.js";
import { getAdmin, authenticate, checkDatabase } from "../server/database.js";
import { decode, rot13 } from "../server/ciphers.js";
import { misinterpret } from "../server/misinterpret.js";

export function createSendHandler(deps = {}) {
  return endpoint(async (req, body) => {
    const db = deps.db || getAdmin();
    const sender = await (deps.authenticate || authenticate)(req, db);
    if (!isUuid(body.challenge_id) || !isUuid(body.submission_id))
      throw new HttpError(400, "Invalid transmission reference.");
    if (
      typeof body.ciphertext !== "string" ||
      !body.ciphertext.trim() ||
      body.ciphertext.length > 280 ||
      !/^[\x20-\x7e\r\n\t]+$/.test(body.ciphertext)
    ) {
      throw new HttpError(
        400,
        "Use 1–280 characters: English letters, numbers, spaces, and punctuation.",
      );
    }
    // An exact retry succeeds even after the challenge expires. Different ciphertext cannot reuse its ID.
    const { data: previous, error: previousError } = await db
      .from("challenges")
      .select(
        "id,recipient_id,cipher,expires_at,used_at,submission_id,submitted_ciphertext",
      )
      .eq("id", body.challenge_id)
      .eq("sender_id", sender)
      .maybeSingle();
    checkDatabase(previousError);
    if (!previous)
      throw new HttpError(409, "That future does not belong to you.");
    if (previous.used_at) {
      if (
        previous.submission_id === body.submission_id &&
        previous.submitted_ciphertext === body.ciphertext
      )
        return { delivered: true, duplicate: true };
      throw new HttpError(
        409,
        "That future was already used. Request a new one.",
      );
    }
    if (Date.parse(previous.expires_at) <= Date.now())
      throw new HttpError(409, "That future has expired. Request a new one.");
    const original = decode(body.ciphertext, previous.cipher);
    const interpreted = await (deps.misinterpret || misinterpret)(original);
    const { data, error } = await db.rpc("deliver_message", {
      p_sender_id: sender,
      p_challenge_id: body.challenge_id,
      p_submission_id: body.submission_id,
      p_ciphertext: body.ciphertext,
      p_original: original,
      p_inbox_ciphertext: rot13(interpreted.text),
      p_engine: interpreted.engine,
    });
    checkDatabase(error);
    // No plaintext, interpretation, or service-role query results are returned to the caller.
    return {
      delivered: true,
      duplicate: data.duplicate,
      engine: interpreted.engine,
    };
  });
}

export default createSendHandler();
