import type { AvatarRenderer } from './AvatarRenderer';

/**
 * Registry for per-agent AvatarRenderer instances.
 *
 * In room (multi-agent) mode each RoomAvatarTile creates its own renderer.
 * The registry lets useChat.ts look up a specific agent's renderer for
 * lip-sync routing without going through the global AppStore renderer.
 */
class AvatarRendererRegistry {
  private renderers = new Map<string, AvatarRenderer>();

  register(agentId: string, renderer: AvatarRenderer): void {
    this.renderers.set(agentId, renderer);
  }

  unregister(agentId: string): void {
    this.renderers.delete(agentId);
  }

  get(agentId: string): AvatarRenderer | null {
    return this.renderers.get(agentId) ?? null;
  }

  has(agentId: string): boolean {
    return this.renderers.has(agentId);
  }

  disposeAll(): void {
    this.renderers.clear();
  }

  get size(): number {
    return this.renderers.size;
  }
}

export const avatarRegistry = new AvatarRendererRegistry();
