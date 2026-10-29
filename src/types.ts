export type HumorMode = 'serious' | 'resenha' | 'chaos';
export type Phase = 'preparation' | 'fight' | 'rest';
export type Status = 'idle' | 'running' | 'paused' | 'finished' | 'ended';
export interface Training { fight: number; rest: number; rounds: number; preparation: number }
export interface Phrase { id: string; text: string; enabled: boolean }
export interface Settings {
  version: 1;
  training: Training;
  appearance: { fight: string; rest: string; preparation: string; scale: number; animations: boolean };
  humor: { mode: HumorMode; photoDuration: number; photosPerRest: number; display: 'start' | 'throughout'; phrases: boolean; animations: boolean };
  audio: { enabled: boolean; volume: number; musicCompatibility: boolean; sirens: boolean; countdown: boolean; lastTen: boolean; returnCue: boolean; funny: boolean };
  phrases: Phrase[];
}
export interface Photo { id: string; name: string; blob: Blob; enabled: boolean; createdAt: number }
export interface TimerSnapshot {
  status: Status; phase: Phase; round: number; rounds: number;
  remaining: number; duration: number; elapsed: number; revision: number;
}
export interface Transition { from: Phase; to: Phase | 'finished'; round: number; at: number }
