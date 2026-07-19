import type { GeneratedProgram } from './contracts.js';

export interface ProgramRevision<TProgram = GeneratedProgram> {
  readonly revision: number;
  readonly program: TProgram;
  readonly reason: string;
}

export function reviseProgram<TProgram>(
  current: ProgramRevision<TProgram>,
  program: TProgram,
  reason: string,
): ProgramRevision<TProgram> {
  return { revision: current.revision + 1, program, reason };
}

export function ownerMatches(authenticatedUserId: string, ownerUserId: string): boolean {
  return authenticatedUserId.length > 0 && authenticatedUserId === ownerUserId;
}
