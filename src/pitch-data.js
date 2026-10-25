// The supplied pitch script, kept separate from live messages and AI generation.
export const demoAssets = [
  {
    id: "kiss",
    label: "1 · Ojass receives",
    description: "Two people kissing, X-ray-style image",
    src: null,
  },
  {
    id: "reverse-evolution",
    label: "1 · Broadcast",
    description: "Evolution line with the human turning back",
    src: null,
  },
  {
    id: "smoking-cat",
    label: "2 · Afaan receives",
    description: "Smoking cat: duniya kb sudregi",
    src: null,
  },
  {
    id: "wallet-warning",
    label: "2 · Broadcast",
    description: "Man holding a gun: aaj bich me koi nahi aayega",
    src: null,
  },
  {
    id: "cat-face",
    label: "3 · Ojass receives",
    description: "Close-up cat face",
    src: null,
  },
  {
    id: "explosion-cat",
    label: "3 · Broadcast",
    description: "Cat with an explosion in the background",
    src: null,
  },
  {
    id: "drinking-cat",
    label: "4 · Afaan receives",
    description: "Cat having a drink poured: Aur daal",
    src: null,
  },
  {
    id: "weird-pose",
    label: "4 · Broadcast",
    description: "Man in a funny pose inside a shop",
    src: null,
  },
];

export const pitchTurns = [
  {
    sender: "Afaan",
    recipient: "Ojass",
    theme: "A completely innocent hello",
    original: "hey",
    interpretation:
      "An unauthorised human seeks friendship.  Maybe his bank balance seeks a miracle.",
    recipientAsset: "kiss",
    headline:
      "A ‘BRO’ MESSAGE HAS BEEN DETECTED. PLEASE SECURE YOUR WALLET IMMEDIATELY.",
    broadcastAsset: "reverse-evolution",
  },
  {
    sender: "Ojass",
    recipient: "Afaan",
    theme: "The Bank of Spain intervenes",
    original: "I can't lend a penny to you!! You already owe me fifty.",
    interpretation:
      "Bella Ciao, ₹50\nYou owe me ₹50 and want another loan? Bro thinks I'm the Bank of Spain. First return the money, then sing Bella Ciao.",
    recipientAsset: "smoking-cat",
    headline:
      "VICTIM'S WALLET ROBBED OF ₹50. SUSPECT CLAIMS THEY ARE ‘JUST FRIENDS.’",
    broadcastAsset: "wallet-warning",
  },
  {
    sender: "Afaan",
    recipient: "Ojass",
    theme: "Midsem damage reports",
    original: "fine bro…let it be how was ur mid semester??",
    interpretation:
      "Bro, did you cook in the midsem or did the midsem cook your bloodline?",
    recipientAsset: "cat-face",
    headline:
      "MIDSEM INTELLIGENCE AGENCY: STUDENTS SECRETLY COLLECTING EACH OTHER’S DAMAGE REPORTS.",
    broadcastAsset: "explosion-cat",
  },
  {
    sender: "Ojass",
    recipient: "Afaan",
    theme: "The professor questions everything",
    original: "It was so bad that….professor will doubt his teaching!!.",
    interpretation:
      "THE ANSWER WAS SO WRONG, THE PROFESSOR APOLOGISED TO HIS DEGREE.",
    recipientAsset: "drinking-cat",
    headline:
      "BREAKING NEWS: PROFESSOR FOUND IN A STATE OF SHOCK AFTER CHECKING STUDENT’S ANSWER SHEET; INVESTIGATION INTO THE STUDENT’S ACADEMIC PERFORMANCE UNDERWAY.",
    broadcastAsset: "weird-pose",
  },
];

function shift(text, amount) {
  return text.replace(/[a-z]/gi, (letter) => {
    const base = letter <= "Z" ? 65 : 97;
    return String.fromCharCode(
      base + ((letter.charCodeAt(0) - base + amount) % 26),
    );
  });
}
export const encodePrepared = (text) => shift(text, 3);
export const decodePrepared = (text) => shift(text, 23);
export const encodeInbox = (text) => shift(text, 13);
export const futureText = encodeInbox(
  "The alphabet arrived three places ahead of schedule. A became D. Your next message must make the same unfortunate journey.",
);

// Presenter perspectives illustrate the flow; real permissions remain in Supabase.
export const inboxFor = (delivered, viewer) =>
  pitchTurns.slice(0, delivered).filter((turn) => turn.recipient === viewer);
export const broadcastFor = (delivered, viewer) =>
  pitchTurns.slice(0, delivered).filter((turn) => turn.recipient !== viewer);
