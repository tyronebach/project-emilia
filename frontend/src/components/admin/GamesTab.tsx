import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import type { Agent, ManageAgentGame, ManageGame } from '../../utils/api';

type AgentWithWorkspace = Agent & {
  workspace: string | null;
  created_at: number;
};

interface GamesTabProps {
  loadingGames: boolean;
  games: ManageGame[];
  agents: AgentWithWorkspace[];
  selectedAgentForGames: string;
  loadingAgentGames: boolean;
  agentGames: ManageAgentGame[];
  agentGameBusy: Set<string>;
  onOpenCreateGame: () => void;
  onOpenEditGame: (game: ManageGame) => void;
  onDeactivateGame: (gameId: string) => void;
  onSelectAgentForGames: (agentId: string) => void;
  onSetAgentGameEnabled: (gameId: string, enabled: boolean) => Promise<void> | void;
  onClearAgentGameOverride: (gameId: string) => Promise<void> | void;
}

function GamesTab({
  loadingGames,
  games,
  agents,
  selectedAgentForGames,
  loadingAgentGames,
  agentGames,
  agentGameBusy,
  onOpenCreateGame,
  onOpenEditGame,
  onDeactivateGame,
  onSelectAgentForGames,
  onSetAgentGameEnabled,
  onClearAgentGameOverride,
}: GamesTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">Games</h2>
          <p className="text-sm text-text-secondary">Manage global game registry and per-agent availability.</p>
        </div>
        <Button onClick={onOpenCreateGame} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Game
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-bg-secondary/70 border border-white/10 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg">Registry</h3>
            <span className="text-xs text-text-secondary">{games.length} total</span>
          </div>

          {loadingGames ? (
            <div className="text-sm text-text-secondary py-6 text-center">Loading games...</div>
          ) : games.length === 0 ? (
            <div className="text-sm text-text-secondary py-6 text-center">No games registered.</div>
          ) : (
            <div className="space-y-2 max-h-[540px] overflow-y-auto pr-1">
              {games.map((game) => (
                <div
                  key={game.id}
                  className="rounded-xl border border-white/10 bg-bg-tertiary/50 p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm text-text-primary">{game.display_name}</div>
                      <div className="text-xs text-text-secondary font-mono">{game.id}</div>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full border ${game.active
                        ? 'border-success/40 text-success'
                        : 'border-white/20 text-text-secondary'
                      }`}
                    >
                      {game.active ? 'active' : 'inactive'}
                    </span>
                  </div>
                  <div className="text-xs text-text-secondary">
                    {game.category} · {game.move_provider_default} · {game.rule_mode} · v{game.version}
                  </div>
                  <div className="text-xs text-text-secondary/80">{game.description}</div>
                  <div className="text-[11px] text-text-secondary font-mono">module: {game.module_key}</div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1"
                      onClick={() => onOpenEditGame(game)}
                    >
                      <Pencil className="w-4 h-4" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-error hover:text-error"
                      onClick={() => onDeactivateGame(game.id)}
                      disabled={!game.active}
                    >
                      <Trash2 className="w-4 h-4" />
                      Deactivate
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-bg-secondary/70 border border-white/10 rounded-2xl p-4 space-y-4">
          <div>
            <h3 className="font-display text-lg">Agent Availability</h3>
            <p className="text-xs text-text-secondary">Enable or disable games per agent.</p>
          </div>

          {agents.length === 0 ? (
            <div className="text-sm text-text-secondary py-6 text-center">Create an agent first.</div>
          ) : (
            <>
              <div>
                <label className="block text-xs text-text-secondary mb-2">Select agent</label>
                <select
                  value={selectedAgentForGames}
                  onChange={(e) => onSelectAgentForGames(e.target.value)}
                  className="w-full bg-bg-tertiary border border-bg-tertiary rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none"
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.display_name} ({agent.id})
                    </option>
                  ))}
                </select>
              </div>

              {loadingAgentGames ? (
                <div className="text-sm text-text-secondary py-6 text-center">Loading agent game config...</div>
              ) : agentGames.length === 0 ? (
                <div className="text-sm text-text-secondary py-6 text-center">No games available for this agent.</div>
              ) : (
                <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                  {agentGames.map((game) => {
                    const busy = agentGameBusy.has(game.id);
                    const active = Boolean(game.active);
                    const effectiveEnabled = Boolean(game.effective_enabled ?? true);
                    const hasOverride = game.config_enabled !== null && game.config_enabled !== undefined;
                    return (
                      <div
                        key={game.id}
                        className={`rounded-xl border p-3 ${effectiveEnabled ? 'border-accent/30 bg-bg-tertiary/60' : 'border-white/10 bg-bg-tertiary/40'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm">{game.display_name}</div>
                            <div className="text-[11px] font-mono text-text-secondary">{game.id}</div>
                          </div>
                          <label className="flex items-center gap-2 text-xs text-text-secondary">
                            <input
                              type="checkbox"
                              checked={effectiveEnabled}
                              disabled={busy || !active}
                              onChange={(e) => void onSetAgentGameEnabled(game.id, e.target.checked)}
                              className="h-4 w-4 accent-accent"
                            />
                            enabled
                          </label>
                        </div>
                        <div className="mt-2 text-xs text-text-secondary">
                          {active ? `Effective mode: ${game.effective_mode ?? game.rule_mode}` : 'Globally inactive'}
                        </div>
                        <div className="mt-1 text-[11px] text-text-secondary/80">
                          {hasOverride
                            ? `Override set (${game.config_enabled ? 'enabled' : 'disabled'})`
                            : 'Inherited from global default'}
                        </div>
                        <div className="mt-2 flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void onClearAgentGameOverride(game.id)}
                            disabled={busy || !hasOverride}
                          >
                            Use Default
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default GamesTab;
