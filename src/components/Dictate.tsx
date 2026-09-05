/**
 * The microphone button, and the sentence that has to sit next to it.
 *
 * Three states matter and each says something different: the voice pack is on
 * the device and this works with the network down; it can be fetched once and
 * then works with the network down; or on-device recognition is unavailable
 * here, in which case there is no button, because the only alternative would
 * send a patient's clinical detail to somebody else's server.
 *
 * Interim words are shown greyed and are never written into the field — only
 * finished sentences are, appended rather than replacing, so dictating into a
 * half-typed note adds to it instead of eating it.
 */
import { useEffect, useRef, useState } from "react";
import { Mic, Square, Download, Loader2 } from "lucide-react";
import {
  speechSupported,
  onDeviceStatus,
  installOnDevice,
  startDictation,
  type DictationHandle,
  type OnDeviceStatus,
} from "@/lib/dictation";

export function Dictate({
  onAppend,
  tag = "en-US",
  hint,
}: {
  onAppend: (text: string) => void;
  tag?: string;
  hint?: string;
}) {
  const [status, setStatus] = useState<OnDeviceStatus | "checking" | null>(null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const handle = useRef<DictationHandle | null>(null);

  useEffect(() => {
    if (!speechSupported()) {
      setStatus("unavailable");
      return;
    }
    let alive = true;
    setStatus("checking");
    void onDeviceStatus(tag).then((s) => {
      if (alive) setStatus(s);
    });
    return () => {
      alive = false;
      handle.current?.stop();
    };
  }, [tag]);

  if (status === null || status === "checking") return null;

  /*
   * No fallback offered on purpose. A microphone that works by streaming the
   * audio elsewhere is not a smaller version of this feature, it is a different
   * one with a disclosure attached, and this product argues the opposite.
   */
  if (status === "unavailable") {
    return (
      <p className="text-[11.5px] leading-relaxed text-muted-foreground">
        Dictation needs on-device speech, which this browser does not offer. It is not falling back
        to cloud recognition — that would send the audio off the island.
      </p>
    );
  }

  if (status === "downloadable" || status === "downloading") {
    return (
      <button
        type="button"
        disabled={status === "downloading"}
        onClick={() => {
          setStatus("downloading");
          void installOnDevice(tag).then((ok) => setStatus(ok ? "available" : "unavailable"));
        }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-semibold text-muted-foreground hover:bg-muted/60 disabled:opacity-60"
      >
        {status === "downloading" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        {status === "downloading" ? "Fetching the voice pack…" : "Turn on dictation (one download)"}
      </button>
    );
  }

  function toggle() {
    setError(null);
    if (listening) {
      handle.current?.stop();
      return;
    }
    const h = startDictation({
      tag,
      onFinal: (text) => onAppend(text),
      onInterim: setInterim,
      onError: (m) => {
        setError(m);
        setListening(false);
      },
      onEnd: () => {
        setListening(false);
        setInterim("");
      },
    });
    if (h) {
      handle.current = h;
      setListening(true);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          className={
            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold " +
            (listening
              ? "border-high/50 bg-high/10 text-high"
              : "border-border text-muted-foreground hover:bg-muted/60")
          }
        >
          {listening ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
          {listening ? "Stop" : "Dictate"}
        </button>
        {listening ? (
          <span className="text-[11.5px] text-muted-foreground">
            Runs on this device — no network, so it works with the lights out.
          </span>
        ) : hint ? (
          <span className="text-[11.5px] text-muted-foreground">{hint}</span>
        ) : null}
      </div>

      {interim ? <p className="text-[12px] italic text-muted-foreground">{interim}…</p> : null}
      {error ? <p className="text-[11.5px] text-high">{error}</p> : null}
    </div>
  );
}
