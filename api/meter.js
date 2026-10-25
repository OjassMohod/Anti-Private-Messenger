import { endpoint, HttpError, isUuid } from "../server/http.js";
import { getAdmin, authenticate, checkDatabase } from "../server/database.js";
import { scoreConversation } from "../server/meter.js";

export function createMeterHandler(deps = {}) {
  return endpoint(async (req, body) => {
    const db = deps.db || getAdmin();
    await (deps.authenticate || authenticate)(req, db);
    if (!isUuid(body.user_a) || !isUuid(body.user_b))
      throw new HttpError(400, "Choose two registered people.");
    const ids = [body.user_a.toLowerCase(), body.user_b.toLowerCase()].sort();
    if (ids[0] === ids[1])
      throw new HttpError(
        400,
        "Choose two different people. Internal monologues are beyond our jurisdiction.",
      );
    // Privileged access is deliberate: scores are public to all signed-in users.
    // Select ONLY profile labels and a count, never broadcast/inbox contents.
    const [profiles, messages] = await Promise.all([
      db.from("profiles").select("id,username").in("id", ids),
      db
        .from("broadcasts")
        .select("id", { count: "exact", head: true })
        .or(
          `and(sender_id.eq.${ids[0]},recipient_id.eq.${ids[1]}),and(sender_id.eq.${ids[1]},recipient_id.eq.${ids[0]})`,
        ),
    ]);
    checkDatabase(profiles.error);
    checkDatabase(messages.error);
    const pair = ids.map((id) =>
      profiles.data?.find((profile) => profile.id === id),
    );
    if (pair.some((person) => !person))
      throw new HttpError(
        404,
        "One of those people is no longer in the workspace.",
      );
    if (!Number.isSafeInteger(messages.count) || messages.count < 0)
      throw new HttpError(
        503,
        "The meter could not count this conversation. Try again shortly.",
      );
    return {
      fictional: true,
      pair,
      message_count: messages.count,
      metrics: scoreConversation(ids, messages.count),
    };
  });
}

export default createMeterHandler();
