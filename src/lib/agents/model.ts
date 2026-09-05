/**
 * The seam where a language model goes.
 *
 * Everything in this product's agent layer is deterministic today, and the UI
 * says so. That is a deliberate choice — see the honesty note in ./core.ts —
 * but it left an important claim resting on prose: "swapping the rules for a
 * model replaces one function and leaves the rest untouched." Asserted in a
 * comment, that is a promise. Written as an interface with two implementations,
 * it is a fact somebody can check by opening one file.
 *
 * ── What the model is and is not allowed to do ──────────────────────────────
 *
 * An adapter is handed a small, already-assembled, already-consent-filtered
 * request and returns a judgement. It never receives a patient id, never reads
 * the database, and never decides what it is allowed to see. That ordering is
 * the whole safety argument:
 *
 *     tools gather  →  consent filters  →  ADAPTER judges  →  clinician approves
 *
 * So the parts that must not hallucinate — which records were read, which were
 * refused, what the numbers actually are, whether anything was written — sit
 * outside the model in every case. A model swap changes the quality of the
 * judgement and nothing about the guarantees around it.
 *
 * ── Why three methods and not one ───────────────────────────────────────────
 *
 * These are the three places in the product where a genuine judgement is made
 * about free text or clinical shape. The pre-consult brief is deliberately not
 * "ask a model to write a brief": its findings are grounded arithmetic over the
 * record, and only the closing agenda — the ordering of what to raise — is a
 * narration task. Handing the whole brief to a model would trade the one
 * property that makes it trustworthy for fluency.
 */
import { ruleBasedTriage, type PatientContext, type TriageResult } from "@/lib/triage.server";
import { classifyIntent, type Intent } from "./ask.rules";
import { buildAgenda, type AgendaSignals } from "./brief.rules";
import { extractFromText, describe } from "@/lib/documents.rules";
import type { ExtractedRecord } from "@/lib/prevention";
import type { Island } from "@/lib/api";

/**
 * A judgement, plus an honest account of where it came from.
 *
 * `degraded` is true whenever rules produced it rather than a model. The care
 * line already surfaces this to clinicians rather than hiding it, which is the
 * behaviour to keep when a model does exist: a fallback nobody is told about
 * is worse than no fallback.
 */
export type Judgement<T> = {
  value: T;
  degraded: boolean;
  note: string;
};

export type TriageRequest = { context: PatientContext; message: string };
export type QuestionRequest = { question: string; islands: Island[] };
export type AgendaRequest = { signals: AgendaSignals };
export type ExtractRequest = { text?: string | undefined; imageDataUrl?: string | undefined };
export type ExtractResponse = { extracted: ExtractedRecord; note: string };

export interface ModelAdapter {
  /** Stable identifier, shown in every agent run so a trace names its author. */
  readonly id: string;
  readonly label: string;
  /** Whether this adapter needs a GPU at all — the compute question, in code. */
  readonly requiresGpu: boolean;
  /** Why it needs the card it needs. Empty for adapters that need none. */
  readonly memoryNote: string;

  /** Grade an inbound patient message. */
  triage(req: TriageRequest): Promise<Judgement<TriageResult>>;
  /** Resolve a plain-language question to an intent the Grid can answer. */
  classifyQuestion(req: QuestionRequest): Promise<Judgement<Intent | null>>;
  /** Order what a clinician should raise, given findings already computed. */
  narrateAgenda(req: AgendaRequest): Promise<Judgement<string[]>>;
  /** Read a clinic card into structured values a human then reviews. */
  extractDocument(req: ExtractRequest): Promise<Judgement<ExtractResponse>>;
}

/**
 * What runs today: explicit rules over the patient's own record.
 *
 * Same input, same output, every time — which is why a reviewer can ask "why
 * did it say that" and get a rule and a data point back. For a pilot that is a
 * stronger position than a fluent answer nobody can reproduce.
 */
export const rulesAdapter: ModelAdapter = {
  id: "rules/v1",
  label: "Deterministic rules (no language model)",
  requiresGpu: false,
  memoryNote: "",

  triage: async (req) => ({
    value: ruleBasedTriage(req.context, req.message),
    degraded: true,
    note: "Deterministic clinical rules — no model configured.",
  }),

  classifyQuestion: async (req) => ({
    value: classifyIntent(req.question, req.islands),
    degraded: true,
    note: "Keyword and pattern matching over the Grid's own vocabulary.",
  }),

  narrateAgenda: async (req) => ({
    value: buildAgenda(req.signals),
    degraded: true,
    note: "Agenda ordered by explicit precedence rules.",
  }),

  /*
   * Text is parsed here and now. A photograph is not: turning pixels into
   * clinical values needs a vision model, and saying otherwise would be the
   * kind of claim this file exists to prevent. The image is stored either way.
   */
  extractDocument: async (req) => {
    if (!req.text?.trim()) {
      return {
        value: {
          extracted: {},
          note: req.imageDataUrl
            ? "Photograph stored and attached. Reading an image needs the vision model — key the values in, or type what the card says and it will be read."
            : "Nothing to read yet.",
        },
        degraded: true,
        note: "No text to parse.",
      };
    }
    const extracted = extractFromText(req.text);
    return {
      value: { extracted, note: describe(extracted) },
      degraded: true,
      note: "Pattern rules over clinical shorthand.",
    };
  },
};

/**
 * What would run on the hardware the buildathon provides.
 *
 * This is a real implementation shape rather than a placeholder: the request it
 * would send, the endpoint it would send it to, and the schema it would demand
 * back. It refuses rather than pretends, because the alternative — silently
 * falling back to rules while reporting itself as a model — is the exact
 * failure this file exists to make impossible.
 *
 * The memory note is the compute argument stated where it belongs, next to the
 * thing that needs the memory: a 70B model at BF16 is roughly 140GB of weights
 * before any KV cache, which does not fit an 80GB H100. At FP8 it fits with
 * room to serve a regional triage line concurrently, and LoRA work on Caribbean
 * creole clinical text needs the headroom above that again.
 */
export class HostedAdapter implements ModelAdapter {
  readonly id: string;
  readonly label: string;
  readonly requiresGpu = true;
  readonly memoryNote =
    "70B at FP8 with a KV cache for concurrent triage — 141GB (H200), not 80GB (H100).";

  constructor(
    private readonly endpoint: string | null,
    private readonly apiKey: string | null,
    model = "llama-3.3-70b-instruct",
  ) {
    this.id = `${model}/fp8`;
    this.label = `${model} (self-hosted)`;
  }

  private async call<T>(task: string, payload: unknown, schemaName: string): Promise<Judgement<T>> {
    if (!this.endpoint || !this.apiKey) {
      throw new Error(
        "No inference endpoint configured. This build runs on rules — see lib/agents/model.ts.",
      );
    }
    const res = await fetch(`${this.endpoint}/v1/judge`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      // Only the assembled, consent-filtered request crosses this boundary —
      // never a patient identifier and never a database handle.
      body: JSON.stringify({ task, schema: schemaName, input: payload }),
    });
    if (!res.ok) throw new Error(`Inference failed: ${res.status}`);
    return { value: (await res.json()) as T, degraded: false, note: `${this.label} · ${task}` };
  }

  triage(req: TriageRequest) {
    return this.call<TriageResult>("triage", req, "TriageSchema");
  }
  classifyQuestion(req: QuestionRequest) {
    return this.call<Intent | null>("classify_question", req, "IntentSchema");
  }
  narrateAgenda(req: AgendaRequest) {
    return this.call<string[]>("narrate_agenda", req, "AgendaSchema");
  }
  extractDocument(req: ExtractRequest) {
    // The one call that carries an image, and the reason the vision half of
    // the model matters as much as the text half.
    return this.call<ExtractResponse>("extract_document", req, "ExtractionSchema");
  }
}

/**
 * Which one is live.
 *
 * There is no gateway key in this build and the shareable artifact is a static
 * file, so a key placed here would be a key handed to everyone the link reaches.
 * The selection is a single assignment on purpose: this is the line that
 * changes when the hardware exists, and nothing else does.
 */
let active: ModelAdapter = rulesAdapter;

export function getAdapter(): ModelAdapter {
  return active;
}

/** Swap the adapter. Exists for the evaluation suite and for the day there is a GPU. */
export function setAdapter(adapter: ModelAdapter) {
  active = adapter;
}

/** Every adapter the product knows how to run, for display. */
export const ADAPTERS: { id: string; label: string; requiresGpu: boolean; live: boolean }[] = [
  { id: rulesAdapter.id, label: rulesAdapter.label, requiresGpu: false, live: true },
  {
    id: "llama-3.3-70b-instruct/fp8",
    label: "Llama 3.3 70B Instruct, FP8 (self-hosted)",
    requiresGpu: true,
    live: false,
  },
];
