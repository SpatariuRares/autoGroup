import type { ProposalWarning } from '../shared/types';

/** Una tab come la vede l'AI: ID breve, titolo e URL ripulito. Mai gli ID di Chrome. */
export interface AiTab {
  id: string;
  title: string;
  url: string;
  description?: string;
}

/** Un'opzione nota: categoria della lista o gruppo già aperto. */
export interface AiOption {
  name: string;
  description: string;
}

export interface GenerateRequest {
  /** "full": sceglie tra le opzioni o inventa; "new-only": inventa gruppi per le tab rimaste (AG-08). */
  mode: 'full' | 'new-only';
  tabs: AiTab[];
  options: AiOption[];
  /** Lingua dei nomi nuovi, es. "italiano". */
  language: string;
}

/** Risposta grezza del Generatore, ancora da validare. */
export interface RawGroup {
  name: unknown;
  tabs: unknown;
}

/** Contratto comune dei Generatori (compatibile OpenAI, Gemini Nano). */
export interface Generator {
  /** Nome del provider per gli avvisi, es. "OpenRouter (openrouter.ai)". */
  readonly label: string;
  generate(request: GenerateRequest, signal?: AbortSignal): Promise<RawGroup[]>;
  /**
   * Facoltativo: prepara in anticipo quello che serve a `generate` con questa modalità e lingua
   * (Gemini Nano crea la sessione), mentre la pipeline fa altro. Non fallisce mai.
   */
  prepare?(mode: GenerateRequest['mode'], language: string): void;
  /** Descrizione di una categoria a partire dal nome e da alcune tab di esempio ("Salva nella lista"). */
  describe(request: DescribeRequest, signal?: AbortSignal): Promise<string>;
}

export interface DescribeRequest {
  name: string;
  examples: AiTab[];
  /** Lingua della descrizione, es. "italiano". */
  language: string;
}

/** Esito del Classificatore per una tab: opzione scelta (null = nessuna) e confidenza calibrata. */
export interface Classification {
  choice: string | null;
  confidence: number;
}

/** Contratto comune dei Classificatori (protocollo System One). */
export interface Classifier {
  readonly label: string;
  /** Per ogni ID breve di tab, l'opzione scelta e la confidenza. */
  classify(tabs: AiTab[], options: AiOption[], signal?: AbortSignal): Promise<Map<string, Classification>>;
}

type ProviderErrorCause = ProposalWarning['cause'];

/** Errore di un provider AI, già classificato per causa. */
export class ProviderError extends Error {
  constructor(
    readonly reason: ProviderErrorCause,
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}
