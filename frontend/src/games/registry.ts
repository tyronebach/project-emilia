// # Phase 1.3 COMPLETE - 2026-02-08
// # Phase 2.1 COMPLETE - 2026-02-07
import type { GameModule } from './types';
import { ticTacToeModule } from './tic-tac-toe/TicTacToeModule';

// In-memory registry; populated by modules in later phases.
const registry = new Map<string, GameModule>();

export function registerGame(module: GameModule): void {
  registry.set(module.id, module);
}

export function getGame(id: string): GameModule | undefined {
  return registry.get(id);
}

export function listGames(): GameModule[] {
  return Array.from(registry.values());
}

registerGame(ticTacToeModule as GameModule);
