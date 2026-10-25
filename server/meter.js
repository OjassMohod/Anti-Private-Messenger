import { createHash } from "node:crypto";

// Intentionally fictional. Neither message contents nor model output are inputs.
export function scoreConversation(userIds, messageCount) {
  if (!Number.isSafeInteger(messageCount) || messageCount < 0)
    throw new TypeError("Invalid message count");
  if (messageCount === 0) return null;
  const pair = userIds.map((id) => id.toLowerCase()).sort();
  const seed = createHash("sha256")
    .update(pair.join(":"), "utf8")
    .digest()
    .readUInt32BE();
  const tones = [
    {
      label: "Goofy mood",
      description: "Nobody is taking this conversation responsibly.",
    },
    {
      label: "Existential crisis",
      description: "The conversation has requested a dramatic pause.",
    },
    {
      label: "Cartoon villain",
      description: "Every sentence now requires an evil swivel chair.",
    },
  ];
  return {
    understanding_percent: -(10 + (seed % 25) + messageCount * 7),
    tone: tones[(seed + messageCount) % tones.length],
    friendship_damage_percent: Math.min(
      100,
      12 + (seed % 25) + messageCount * 6,
    ),
    financial_risk_credits: messageCount * (250 + (seed % 51) * 100),
  };
}
