/**
 * Speaking instead of typing — and the condition attached to it.
 *
 * The question this answers is a practical one: the lights are out, a doctor
 * has written two lines on a card, and typing them back in later is the tax
 * this product exists to remove. Speaking them is faster than typing them, and
 * it is far faster on a phone in poor light.
 *
 * ── Why this refuses to use the ordinary browser speech API ─────────────────
 *
 * The Web Speech API's default path streams the microphone to the browser
 * vendor's servers. For a dictated sentence about a named patient's diagnosis
 * that is a disclosed third-party transfer, and this product's entire argument
 * is that Caribbean clinical data stays where it was created. Shipping a
 * microphone button that quietly contradicts that would be worse than shipping
 * no button.
 *
 * So dictation here runs on-device or it does not run. Chrome exposes exactly
 * that — `processLocally`, with the language pack downloaded once and used
 * offline afterwards — and where it is unavailable this says so plainly rather
 * than falling back to the network. That constraint buys something back: a
 * transcriber that never needs the network is a transcriber that works during
 * the power cut, which is the case that prompted it.
 *
 * ── What it does not do ─────────────────────────────────────────────────────
 *
 * Recognition is trained on standard English. A clinician switching into Patois
 * or Kreyòl mid-sentence — which is how people actually speak here — will get
 * poor results, and that is not a bug this file can fix. It needs a model fine-
 * tuned on Caribbean speech, which needs the hardware. Said out loud in the
 * interface rather than left for somebody to discover.
 */

export type OnDeviceStatus = "available" | "downloadable" | "downloading" | "unavailable";

type RecognitionEventLike = {
  resultIndex: number;
  results: { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } };
};

type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally?: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: RecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type RecognitionCtor = {
  new (): RecognitionLike;
  available?: (o: { langs: string[]; processLocally: boolean }) => Promise<OnDeviceStatus>;
  install?: (o: { langs: string[]; processLocally: boolean }) => Promise<boolean>;
};

function ctor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w["SpeechRecognition"] ?? w["webkitSpeechRecognition"] ?? null) as RecognitionCtor | null;
}

export function speechSupported(): boolean {
  return ctor() !== null;
}

/**
 * Recognition tags for the languages the patient surfaces speak.
 *
 * Patois and Kreyòl have no recognition support anywhere, so they fall back to
 * English rather than failing silently — and the caller is told, because a
 * transcript that is quietly wrong is the worst outcome available here.
 */
export const RECOGNITION_LANG: Record<string, { tag: string; exact: boolean }> = {
  en: { tag: "en-US", exact: true },
  es: { tag: "es-ES", exact: true },
  jam: { tag: "en-US", exact: false },
  ht: { tag: "fr-FR", exact: false },
};

export function recognitionLangFor(appLang: string) {
  return RECOGNITION_LANG[appLang] ?? RECOGNITION_LANG["en"]!;
}

/** Whether the language pack is on this device already, downloadable, or absent. */
export async function onDeviceStatus(tag: string): Promise<OnDeviceStatus> {
  const C = ctor();
  if (!C?.available) return "unavailable";
  try {
    return await C.available({ langs: [tag], processLocally: true });
  } catch {
    return "unavailable";
  }
}

/** Fetch the pack once. After this, dictation works with the network down. */
export async function installOnDevice(tag: string): Promise<boolean> {
  const C = ctor();
  if (!C?.install) return false;
  try {
    return await C.install({ langs: [tag], processLocally: true });
  } catch {
    return false;
  }
}

/**
 * Spoken clinical shorthand, written the way the record expects it.
 *
 * A dictated blood pressure arrives as "156 over 96", and the reader that files
 * these values is looking for a slash. Without this step the microphone would
 * produce text that looks right to a person and parses to nothing — the exact
 * failure mode this codebase has been correcting all week.
 */
const SPOKEN: [RegExp, string][] = [
  [/\b(\d{2,3})\s+over\s+(\d{2,3})\b/gi, "$1/$2"],
  [/\bmilligrams?\b/gi, "mg"],
  [/\bmicrograms?\b/gi, "mcg"],
  [/\bkilograms?\b|\bkilos\b/gi, "kg"],
  [/\bpercent\b/gi, "%"],
  [/\bb\.?\s?p\.?\b(?=\s|$|\d)/gi, "BP"],
  [/\bh\.?\s?b\.?\s?a\.?\s?(?:one|1)\s?c\b/gi, "HbA1c"],
  [/\bnew line\b/gi, "\n"],
  [/\bfull stop\b/gi, "."],
];

export function normaliseSpoken(raw: string): string {
  let out = raw;
  for (const [re, to] of SPOKEN) out = out.replace(re, to);
  // A spoken "new line" arrives surrounded by the spaces that separated the
  // words, and a line the reader has to trim twice is a line waiting to be
  // mis-split. Tidy the break itself, not just runs of spaces.
  return out
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export type DictationHandle = { stop: () => void };

/**
 * Listen, and hand back finished sentences.
 *
 * Interim text is reported separately so the caller can show it greyed while it
 * is still changing — committing a half-heard sentence into a clinical note and
 * then rewriting it under the clinician's cursor would be worse than a delay.
 */
export function startDictation(opts: {
  tag: string;
  onFinal: (text: string) => void;
  onInterim: (text: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}): DictationHandle | null {
  const C = ctor();
  if (!C) return null;

  const rec = new C();
  rec.lang = opts.tag;
  rec.continuous = true;
  rec.interimResults = true;
  // The whole point. Where the browser ignores it, the availability check has
  // already stopped us before we get here.
  rec.processLocally = true;

  rec.onresult = (e) => {
    let final = "";
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i += 1) {
      const r = e.results[i];
      if (!r) continue;
      if (r.isFinal) final += r[0].transcript;
      else interim += r[0].transcript;
    }
    if (final.trim()) opts.onFinal(normaliseSpoken(final));
    opts.onInterim(interim.trim());
  };

  rec.onerror = (e) => {
    opts.onError(
      e.error === "not-allowed"
        ? "The microphone was blocked. Allow it for this page, then try again."
        : e.error === "no-speech"
          ? "Nothing was heard."
          : e.error === "network"
            ? "On-device recognition is not running, and this will not use the network."
            : "Dictation stopped unexpectedly.",
    );
  };

  rec.onend = () => opts.onEnd();

  try {
    rec.start();
  } catch {
    opts.onError("Dictation could not start.");
    return null;
  }
  return { stop: () => rec.stop() };
}
