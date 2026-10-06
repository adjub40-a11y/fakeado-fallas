// Tipos compartidos del juego ¡Fakeado!

/** Nivel de edad de un jugador: 1 = Peques (6-8), 2 = Junior (9-12), 3 = Teen (13-16), 4 = Adulto */
export type PlayerLevel = 1 | 2 | 3 | 4;
/** Nivel mínimo de una pregunta: 1 apta desde 6 años, 2 desde 9, 3 desde 13 */
export type QuestionLevel = 1 | 2 | 3;

export interface Question {
  id: string;
  cat: string;
  lvl: QuestionLevel;
  /** Enunciado con un hueco "___" */
  q: string;
  /** Respuesta verdadera */
  a: string;
  /** Otras formas válidas de escribir la verdad (para detectar si alguien la escribe sin querer) */
  alias: string[];
  /** Mentiras de la casa (al menos 2) */
  house: string[];
  /** 3 mentiras sugeridas para jugadores Peques (obligatorias en nivel 1) */
  kids: string[];
  /** Dato curioso que se muestra al revelar */
  fact: string;
  /** Incluida en la versión gratuita */
  free: boolean;
}

export type Phase = 'lie' | 'vote' | 'reveal' | 'scores' | 'final';
export type TimerMode = 'normal' | 'relajado' | 'sin';

export interface Settings {
  rounds: number; // nº de rondas (la última puntúa doble)
  perRound: number; // preguntas por ronda
  timer: TimerMode;
  cats: string[]; // categorías activas (vacío = todas)
  unlocked: boolean; // el anfitrión tiene el pack completo
}

export interface Player {
  name: string;
  avatar: string;
  level: PlayerLevel;
  score: number;
  joinedAt: number;
  online?: boolean;
}

export interface Option {
  id: string;
  text: string;
}

/** Lo que se publica de la pregunta durante la fase de mentira/voto (sin la respuesta) */
export interface PublicQuestion {
  id: string;
  cat: string;
  q: string;
  kids: string[];
}

export interface RevealInfo {
  truthId: string;
  answer: string;
  fact: string;
  /** optionId -> autores (ids de jugador, o 'house') */
  authors: Record<string, string[]>;
  /** puntos ganados en esta pregunta por jugador */
  gained: Record<string, number>;
}

export interface GameState {
  phase: Phase;
  round: number; // 1..rounds
  qNum: number; // 1..rounds*perRound (contador global)
  total: number;
  question: PublicQuestion;
  options?: Option[];
  deadline?: number | null; // ms (hora del servidor) o null sin tiempo
  reveal?: RevealInfo;
  multiplier: number;
}

export interface LieEntry {
  text: string;
  at: number;
}

export interface RoomState {
  code: string;
  hostId: string;
  hostPlays: boolean;
  status: 'lobby' | 'playing' | 'ended';
  createdAt: number;
  settings: Settings;
  players: Record<string, Player>;
  game?: GameState;
  lies?: Record<string, LieEntry>;
  /** pid -> motivo de rechazo de su mentira */
  rejects?: Record<string, string>;
  votes?: Record<string, string>;
  /** historial de revelaciones para los premios finales: clave q1, q2... */
  history?: Record<string, { reveal: RevealInfo; votes: Record<string, string> }>;
  /** el anfitrión sigue conectado (solo online) */
  hostOnline?: boolean;
}

/** Datos que solo ve el anfitrión */
export interface HostSecret {
  order: string[]; // ids de preguntas de la partida
  answer: string;
  alias: string[];
  house: string[];
  fact: string;
  /** optionId -> autores */
  authors?: Record<string, string[]>;
  truthId?: string;
}
