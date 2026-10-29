import type { Phase, Training } from '../types.ts';
export type ProtocolId = 'descending' | 'drills-1-1' | 'drills-sequence';
interface Protocol { name: string; fights: readonly number[]; rests: readonly number[] }
export const PROTOCOLS: Readonly<Record<ProtocolId, Protocol>> = {
  descending: { name:'Rolas Decrescentes', fights:[600,480,360], rests:[120,120,0] },
  'drills-1-1': { name:'Drills Padrões 1/1', fights:Array(8).fill(60), rests:[10,10,10,10,10,10,10,0] },
  // Round 4's single 30-second gap is the student change, not an extra rest.
  'drills-sequence': { name:'Drills em Sequência 4/0:30', fights:Array(8).fill(60), rests:[30,30,30,30,30,30,30,0] }
};
export function isProtocol(value: unknown): value is ProtocolId { return typeof value === 'string' && Object.hasOwn(PROTOCOLS,value); }
export function protocolTraining(id: ProtocolId): Training {
  const p = PROTOCOLS[id]; if (!p) throw new Error('Treino predefinido inválido.');
  return { fight:p.fights[0],rest:p.rests[0],rounds:p.fights.length,preparation:3 };
}
export function protocolDuration(id: ProtocolId, phase: Phase, round: number): number {
  return phase === 'preparation' ? 3 : PROTOCOLS[id][phase === 'fight' ? 'fights' : 'rests'][round-1];
}
export function protocolStage(id: ProtocolId | undefined, phase: Phase, round: number): string {
  if (id === 'drills-sequence') return phase === 'rest' && round === 4 ? 'Troca de aluno' : `Aluno ${round<=4 ? 1 : 2} · rodada ${(round-1)%4+1}/4`;
  if (id === 'drills-1-1' && phase === 'rest') return 'Troca entre rodadas';
  return '';
}
