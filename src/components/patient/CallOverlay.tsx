/**
 * A call in progress — voice or video.
 *
 * Two callers: the patient's care line, where a patient taps a button in the
 * thread, and the clinician's appointment, where a consultant starts the
 * teleconsult. Same component so the two ends of the same call cannot drift.
 *
 * No network is dialled. Module 01 of the brief asks for teleconsultation
 * infrastructure and the PRD scopes that as "a convincing consult UI, not real
 * video infrastructure" — this is that UI, and it says so on screen.
 */
import { useEffect, useState } from "react";
import { Phone, PhoneOff, MicOff, Volume2, Video, VideoOff, User } from "lucide-react";

export type CallMode = "voice" | "video";

export function formatCallTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function CallOverlay({
  mode,
  title,
  subtitle,
  /** What the far end is doing before it answers. */
  ringingLabel = "Ringing…",
  onEnd,
}: {
  mode: CallMode;
  title: string;
  subtitle?: string;
  ringingLabel?: string;
  /** Seconds connected — 0 when the call was never answered. */
  onEnd: (seconds: number) => void;
}) {
  const [phase, setPhase] = useState<"ringing" | "connected">("ringing");
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (phase !== "ringing") return;
    const t = window.setTimeout(() => setPhase("connected"), 2200);
    return () => window.clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "connected") return;
    const started = Date.now();
    const t = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, [phase]);

  const connected = phase === "connected";

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-foreground/95 text-background">
      {mode === "video" && connected ? (
        // Two panes: the far end fills the frame, you sit in the corner. Both are
        // placeholders — there is no camera behind this.
        <div className="relative flex-1 overflow-hidden">
          <div className="grid h-full w-full place-items-center bg-background/5">
            <div className="flex flex-col items-center gap-2 text-background/40">
              <User className="h-16 w-16" />
              <p className="text-[12px]">{title}</p>
            </div>
          </div>
          <div className="absolute bottom-4 right-4 grid h-28 w-40 place-items-center rounded-xl border border-background/20 bg-background/10">
            <div className="flex flex-col items-center gap-1 text-background/40">
              <User className="h-7 w-7" />
              <p className="text-[10.5px]">You</p>
            </div>
          </div>
          <p className="absolute left-4 top-4 rounded-full bg-foreground/60 px-3 py-1 text-[12px]">
            {formatCallTime(seconds)}
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <span className="grid h-20 w-20 place-items-center rounded-full bg-background/10">
            {mode === "video" ? <Video className="h-8 w-8" /> : <Phone className="h-8 w-8" />}
          </span>
          <p className="font-display text-[20px] font-semibold">{title}</p>
          {subtitle ? <p className="text-[13px] text-background/70">{subtitle}</p> : null}
          <p className="text-[13px] text-background/70">
            {connected ? formatCallTime(seconds) : ringingLabel}
          </p>
          {connected ? (
            <p className="max-w-xs text-center text-[12px] leading-relaxed text-background/60">
              {mode === "video" ? "Video consult" : "Voice call"} over WhatsApp — no data plan
              assumptions beyond the channel the patient already uses, and it is logged to the
              record like any other contact.
            </p>
          ) : null}
        </div>
      )}

      <div className="flex items-center justify-center gap-4 pb-10 pt-4">
        <button
          type="button"
          aria-label="Mute"
          className="grid h-12 w-12 place-items-center rounded-full bg-background/10 transition-colors hover:bg-background/20"
        >
          <MicOff className="h-5 w-5" />
        </button>
        {mode === "video" ? (
          <button
            type="button"
            aria-label="Turn camera off"
            className="grid h-12 w-12 place-items-center rounded-full bg-background/10 transition-colors hover:bg-background/20"
          >
            <VideoOff className="h-5 w-5" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onEnd(connected ? seconds : 0)}
          aria-label="End call"
          className="grid h-14 w-14 place-items-center rounded-full bg-critical text-white transition-transform hover:scale-105"
        >
          <PhoneOff className="h-6 w-6" />
        </button>
        <button
          type="button"
          aria-label="Speaker"
          className="grid h-12 w-12 place-items-center rounded-full bg-background/10 transition-colors hover:bg-background/20"
        >
          <Volume2 className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
