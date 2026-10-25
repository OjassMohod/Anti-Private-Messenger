import { createClient } from "@supabase/supabase-js";
import { HttpError } from "./http.js";

let admin;
export function getAdmin() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new HttpError(
      503,
      "Server setup pending. Configure the Supabase server environment variables.",
    );
  }
  admin ??= createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (url, options) =>
          fetch(url, { ...options, signal: AbortSignal.timeout(5000) }),
      },
    },
  );
  return admin;
}

export async function authenticate(req, db) {
  const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || "");
  if (!match) throw new HttpError(401, "Sign in before transmitting.");
  const { data, error } = await db.auth.getUser(match[1]);
  if (error || !data.user)
    throw new HttpError(401, "Your session expired. Sign in again.");
  return data.user.id;
}

export function checkDatabase(error) {
  if (!error) return;
  const known = {
    PROFILE_REQUIRED: [409, "Choose a username before transmitting."],
    INVALID_RECIPIENT: [400, "Choose another registered user."],
    TOO_FAST: [429, "The future needs a moment. Please wait three seconds."],
    CHALLENGE_INVALID: [
      409,
      "That future has expired or was already used. Request a new one.",
    ],
    SUBMISSION_CONFLICT: [
      409,
      "This submission belongs to a different transmission.",
    ],
  };
  const found = known[error.message];
  if (found) throw new HttpError(...found);
  throw new HttpError(
    503,
    "Database operation failed. Check the migration and server configuration.",
  );
}
