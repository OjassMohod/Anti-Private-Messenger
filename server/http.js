export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const isUuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

async function readJson(req) {
  const max = 8192;
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw new HttpError(415, "Send JSON. Even bureaucracy has standards.");
  let body = req.body;
  if (body === undefined) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += Buffer.byteLength(chunk);
      if (size > max) throw new HttpError(413, "Submission is too large.");
      chunks.push(Buffer.from(chunk));
    }
    body = Buffer.concat(chunks).toString("utf8");
  }
  if (typeof body === "string") {
    if (Buffer.byteLength(body) > max)
      throw new HttpError(413, "Submission is too large.");
    try {
      body = JSON.parse(body);
    } catch {
      throw new HttpError(400, "Invalid JSON.");
    }
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new HttpError(400, "Invalid request body.");
  if (Buffer.byteLength(JSON.stringify(body)) > max)
    throw new HttpError(413, "Submission is too large.");
  return body;
}

export function endpoint(action) {
  return async (req, res) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    try {
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        throw new HttpError(405, "Use POST.");
      }
      const result = await action(req, await readJson(req));
      res.statusCode = 200;
      res.end(JSON.stringify(result));
    } catch (error) {
      res.statusCode = error instanceof HttpError ? error.status : 500;
      res.end(
        JSON.stringify({
          error:
            error instanceof HttpError
              ? error.message
              : "The transmission failed. Try again shortly.",
        }),
      );
      // Never log request bodies, bearer tokens, provider responses, or message plaintext.
      if (!(error instanceof HttpError))
        console.error("API request failed:", error.name || "Error");
    }
  };
}
