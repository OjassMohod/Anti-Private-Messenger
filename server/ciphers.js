function transform(text, map) {
  return text.replace(/[a-z]/gi, (letter) => {
    const base = letter <= "Z" ? 65 : 97;
    return String.fromCharCode(base + map(letter.charCodeAt(0) - base));
  });
}

export function decode(text, method) {
  if (method === "caesar") return transform(text, (n) => (n + 23) % 26);
  if (method === "atbash") return transform(text, (n) => 25 - n);
  throw new Error("Unsupported cipher");
}

export function rot13(text) {
  return transform(text, (n) => (n + 13) % 26);
}

export const puzzles = {
  caesar: {
    text: "The alphabet arrived three places ahead of schedule. A became D. Your next message must make the same unfortunate journey.",
    label: "Dispatch from tomorrow / 03",
  },
  atbash: {
    text: "Tomorrow, the alphabet faces its reflection. The first letter becomes the last; B becomes Y. Send your words through the mirror.",
    label: "Dispatch from tomorrow / 26",
  },
};
