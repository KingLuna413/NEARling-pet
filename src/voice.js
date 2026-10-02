// v1 pet voice: deterministic lines and a daily call, derived from on-chain
// stats and the account id. No API key, no network â€” a real LLM can replace
// this layer later behind a serverless proxy.
import { hashString } from "./pet.js";

export const MOODS = [
  { key: "joyful", label: "Joyful" },
  { key: "content", label: "Content" },
  { key: "hungry", label: "Hungry" },
  { key: "sleepy", label: "Sleepy" },
  { key: "worried", label: "Worried" },
];

function pick(list, seed, salt) {
  return list[hashString(`${seed}:${salt}`) % list.length];
}

export function moodFor({ fullness, change24h }) {
  if (fullness >= 70 && (change24h ?? 0) >= 0) return "joyful";
  if (fullness >= 40 && (change24h ?? 0) >= -5) return "content";
  if (fullness < 15) return "hungry";
  if ((change24h ?? 0) <= -12) return "worried";
  return "sleepy";
}

export function petVoice({ account, name, level, fullness, mood, change24h, day }) {
  const seed = `${account}:${day}`;
  const openers = [
    `${name} blinks twice and waddles closer.`,
    `${name} sniffs the air and tilts their head.`,
    `${name} taps the ground with a tiny foot.`,
    `${name} stretches like nothing happened.`,
    `${name} peers at you from behind the feed.`,
  ];
  const bodies = {
    joyful: [
      "Today feels fat. I am full and the chart is smiling.",
      "I could carry this whole bag uphill and back.",
    ],
    content: [
      "Steady is fine. Steady means snacks later.",
      "I am not rich yet, but I am comfortable.",
    ],
    hungry: [
      "I am running on fumes. A little buy would help.",
      "Feed me and I will pretend it was your idea.",
    ],
    sleepy: [
      "I will nap, you watch the candles. Deal?",
      "Wake me when something actually moves.",
    ],
    worried: [
      "Everything is red and I am but a small creature.",
      "Hold me, or at least hold the bag.",
    ],
  };
  const closers = [
    "Do not sell me to a bigger wallet.",
    "I am a long-term kind of pet.",
    "If I level up, you get bragging rights.",
    "I bite ruggers.",
  ];
  const height = fullness >= 70 ? "round" : fullness >= 35 ? "normal" : "thin";
  return `${pick(openers, seed, "o")} ${pick(bodies[mood] ?? bodies.content, seed, "b")} ${height === "round" ? "I am, objectively, quite round right now." : height === "thin" ? "I feel a bit thin these days." : "I am about average size."} ${pick(closers, seed, "c")}`;
}

/** The pet's once-a-day market opinion. Scored later against the price. */
export function dailyCall({ account, day }) {
  const seed = hashString(`${account}:call:${day}`);
  const side = seed % 2 === 0 ? "bull" : "bear";
  const confidence = 45 + (seed % 50);
  const reason = pick(
    side === "bull"
      ? ["the chart has good posture", "holders keep feeding me", "I dreamt of green candles", "the community looks awake"]
      : ["the chart is sweating", "I heard a big wallet yawn", "my left whisker twitched down", "too many people are too happy"],
    `${account}:${day}`,
    "r",
  );
  return { side, confidence, reason, day };
}
