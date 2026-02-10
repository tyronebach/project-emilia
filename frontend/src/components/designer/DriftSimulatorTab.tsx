import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle, Loader2, Play } from 'lucide-react';
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
  CartesianGrid,
} from 'recharts';
import { Button } from '../ui/button';
import {
  getArchetypes,
  getPersonality,
  getPersonalities,
  runDriftComparison,
  runDriftSimulation,
} from '../../utils/designerApiV2';
import type { DriftComparisonResult, DriftSimulationConfig, DriftSimulationResult } from '../../types/designer';

const COLORS = ['#60a5fa', '#f59e0b', '#34d399', '#f472b6', '#a78bfa', '#fb7185'];

function formatNumber(value: number): string {
  return value >= 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
}

function DriftSimulatorTab() {
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [selectedArchetype, setSelectedArchetype] = useState<string>('aggressive');
  const [durationDays, setDurationDays] = useState(7);
  const [sessionsPerDay, setSessionsPerDay] = useState(2);
  const [messagesPerSession, setMessagesPerSession] = useState(20);
  const [seed, setSeed] = useState('');
  const [compareMode, setCompareMode] = useState(false);
  const [compareArchetypes, setCompareArchetypes] = useState<string[]>([]);

  const [result, setResult] = useState<DriftSimulationResult | null>(null);
  const [comparison, setComparison] = useState<DriftComparisonResult | null>(null);

  const { data: agents, isLoading: agentsLoading } = useQuery({
    queryKey: ['designer-v2', 'personalities'],
    queryFn: getPersonalities,
  });

  const { data: personality } = useQuery({
    queryKey: ['designer-v2', 'personality', selectedAgent],
    queryFn: () => getPersonality(selectedAgent),
    enabled: !!selectedAgent,
  });

  const { data: archetypes, isLoading: archetypesLoading } = useQuery({
    queryKey: ['designer-v2', 'archetypes'],
    queryFn: getArchetypes,
  });

  const simMutation = useMutation({
    mutationFn: (config: DriftSimulationConfig) => runDriftSimulation(config),
    onSuccess: (data) => {
      setResult(data);
      setComparison(null);
    },
  });

  const compareMutation = useMutation({
    mutationFn: (payload: {
      agentId: string;
      archetypes: string[];
      durationDays: number;
      sessionsPerDay: number;
      messagesPerSession: number;
    }) =>
      runDriftComparison(
        payload.agentId,
        payload.archetypes,
        payload.durationDays,
        payload.sessionsPerDay,
        payload.messagesPerSession
      ),
    onSuccess: (data) => {
      setComparison(data);
      setResult(null);
    },
  });

  const handleRun = () => {
    if (!selectedAgent) return;
    if (compareMode) {
      if (compareArchetypes.length === 0) return;
      compareMutation.mutate({
        agentId: selectedAgent,
        archetypes: compareArchetypes,
        durationDays,
        sessionsPerDay,
        messagesPerSession,
      });
      return;
    }

    const config: DriftSimulationConfig = {
      agent_id: selectedAgent,
      archetype: selectedArchetype,
      duration_days: durationDays,
      sessions_per_day: sessionsPerDay,
      messages_per_session: messagesPerSession,
      seed: seed ? Number(seed) : undefined,
    };
    simMutation.mutate(config);
  };

  const dailyChartData = useMemo(() => {
    if (!result) return [];
    return result.daily_summaries.map((day) => ({
      day: day.day + 1,
      valence: day.avg_valence,
      arousal: day.avg_arousal,
      trust: day.avg_trust,
      intimacy: day.avg_intimacy,
    }));
  }, [result]);

  const moodData = useMemo(() => {
    if (!result) return [];
    return Object.entries(result.mood_distribution).map(([name, value]) => ({
      name,
      value,
    }));
  }, [result]);

  const moodShiftData = useMemo(() => {
    if (!result || !personality) return [];
    const baseline = personality.mood_baseline ?? {};
    const finalWeights =
      result.timeline.length > 0
        ? (result.timeline[result.timeline.length - 1].state.mood_weights as Record<string, number> | undefined) ?? {}
        : {};

    const keys = new Set([...Object.keys(baseline), ...Object.keys(finalWeights)]);
    const rows = Array.from(keys).map((key) => {
      const baseVal = baseline[key] ?? 0;
      const finalVal = finalWeights[key] ?? 0;
      return {
        mood: key,
        baseline: Number(baseVal.toFixed(3)),
        final: Number(finalVal.toFixed(3)),
        delta: Number((finalVal - baseVal).toFixed(3)),
      };
    });

    rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return rows.slice(0, 10);
  }, [result, personality]);

  const topMoodSeries = useMemo(() => {
    if (!result) return { moods: [], series: [] as Array<Record<string, number | string>> };

    const lastState =
      result.timeline.length > 0
        ? (result.timeline[result.timeline.length - 1].state.mood_weights as Record<string, number> | undefined) ?? {}
        : {};

    const moods = Object.entries(lastState)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .slice(0, 5)
      .map(([name]) => name);

    if (moods.length === 0) return { moods: [], series: [] as Array<Record<string, number | string>> };

    const pointsByDay: Record<number, Array<Record<string, number>>> = {};
    for (const point of result.timeline) {
      const weights = (point.state.mood_weights as Record<string, number> | undefined) ?? {};
      if (!pointsByDay[point.day]) pointsByDay[point.day] = [];
      pointsByDay[point.day].push(weights);
    }

    const series = Object.keys(pointsByDay)
      .map((dayKey) => Number(dayKey))
      .sort((a, b) => a - b)
      .map((day) => {
        const dayWeights = pointsByDay[day];
        const row: Record<string, number | string> = { day: day + 1 };
        for (const mood of moods) {
          const avg =
            dayWeights.reduce((sum, w) => sum + (w[mood] ?? 0), 0) / (dayWeights.length || 1);
          row[mood] = Number(avg.toFixed(3));
        }
        return row;
      });

    return { moods, series };
  }, [result]);

  const topTriggers = result?.trigger_stats.slice(0, 8) ?? [];
  const events = result?.significant_events ?? [];

  const comparisonChartData = useMemo(() => {
    if (!comparison) return [];
    const byArchetype: Record<string, DriftSimulationResult> = {};
    for (const entry of comparison.comparisons) {
      byArchetype[entry.archetype] = entry.result;
    }

    const maxDays = Math.max(
      0,
      ...Object.values(byArchetype).map((r) => r.daily_summaries.length)
    );

    const rows = [];
    for (let day = 0; day < maxDays; day += 1) {
      const row: Record<string, number | string> = { day: day + 1 };
      for (const [arch, res] of Object.entries(byArchetype)) {
        const summary = res.daily_summaries[day];
        row[arch] = summary ? summary.avg_valence : 0;
      }
      rows.push(row);
    }
    return rows;
  }, [comparison]);

  const archetypeOptions = archetypes ?? [];
  const isBusy = simMutation.isPending || compareMutation.isPending;
  const canRun =
    selectedAgent &&
    (compareMode ? compareArchetypes.length > 0 : !!selectedArchetype);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-display text-text-primary">Drift Simulator</h2>
        <p className="text-sm text-text-secondary mt-1">
          Simulate long-term emotional drift using the emotion engine math. Choose a user archetype and
          run multi-day sessions to see how the agent evolves over time.
        </p>
      </div>

      <div className="bg-bg-secondary/70 border border-white/10 rounded-2xl p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Agent</label>
            <select
              value={selectedAgent}
              onChange={(e) => {
                setSelectedAgent(e.target.value);
                setResult(null);
                setComparison(null);
              }}
              disabled={agentsLoading}
              className="w-full bg-bg-tertiary border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              <option value="">{agentsLoading ? 'Loading agents...' : 'Select agent...'}</option>
              {agents?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">User Archetype</label>
            <select
              value={selectedArchetype}
              onChange={(e) => setSelectedArchetype(e.target.value)}
              disabled={archetypesLoading || compareMode}
              className="w-full bg-bg-tertiary border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              {archetypeOptions.length === 0 && (
                <option value="">Loading archetypes...</option>
              )}
              {archetypeOptions.map((arch) => (
                <option key={arch.id} value={arch.id}>
                  {arch.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Duration (days)</label>
            <input
              type="number"
              min={1}
              max={365}
              value={durationDays}
              onChange={(e) => setDurationDays(Number(e.target.value))}
              className="w-full bg-bg-tertiary border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Sessions / day</label>
            <input
              type="number"
              min={1}
              max={6}
              value={sessionsPerDay}
              onChange={(e) => setSessionsPerDay(Number(e.target.value))}
              className="w-full bg-bg-tertiary border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Messages / session</label>
            <input
              type="number"
              min={5}
              max={60}
              value={messagesPerSession}
              onChange={(e) => setMessagesPerSession(Number(e.target.value))}
              className="w-full bg-bg-tertiary border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={compareMode}
              onChange={(e) => {
                setCompareMode(e.target.checked);
                setComparison(null);
                setResult(null);
              }}
              className="accent-accent"
            />
            Compare multiple archetypes
          </label>
          <div className="flex-1" />
          <div className="w-full md:w-48">
            <label className="block text-xs text-text-secondary mb-1">Seed (optional)</label>
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              disabled={compareMode}
              className="w-full bg-bg-tertiary border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        {compareMode && (
          <div className="flex flex-wrap gap-2">
            {archetypeOptions.map((arch) => {
              const selected = compareArchetypes.includes(arch.id);
              return (
                <button
                  key={arch.id}
                  type="button"
                  onClick={() => {
                    setCompareArchetypes((prev) =>
                      selected ? prev.filter((id) => id !== arch.id) : [...prev, arch.id]
                    );
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                    selected
                      ? 'bg-accent/20 border-accent text-text-primary'
                      : 'bg-bg-tertiary border-white/10 text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {arch.name}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="text-xs text-text-secondary">
            {compareMode
              ? 'Runs each archetype with the same config for side-by-side comparison.'
              : 'Single run uses deterministic sampling with optional seed.'}
          </div>
          <Button size="sm" onClick={handleRun} disabled={!canRun || isBusy}>
            {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Run Simulation
          </Button>
        </div>
      </div>

      {(simMutation.isError || compareMutation.isError) && (
        <div className="p-3 bg-error/10 border border-error/30 rounded-lg flex items-center gap-2 text-error text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {simMutation.error instanceof Error
            ? simMutation.error.message
            : compareMutation.error instanceof Error
              ? compareMutation.error.message
              : 'Simulation failed'}
        </div>
      )}

      {result && (
        <div className="space-y-6">
          <div className="bg-bg-secondary/70 border border-white/10 rounded-2xl p-4">
            <h3 className="text-sm font-medium text-text-secondary mb-3 uppercase tracking-wider">
              Emotional Trajectory
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="day" tick={{ fill: '#9ca3af' }} />
                  <YAxis domain={[-1, 1]} tick={{ fill: '#9ca3af' }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="valence" stroke="#60a5fa" strokeWidth={2} />
                  <Line type="monotone" dataKey="arousal" stroke="#f59e0b" strokeWidth={2} />
                  <Line type="monotone" dataKey="trust" stroke="#34d399" strokeWidth={2} />
                  <Line type="monotone" dataKey="intimacy" stroke="#f472b6" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-bg-secondary/70 border border-white/10 rounded-2xl p-4">
              <h3 className="text-sm font-medium text-text-secondary mb-3 uppercase tracking-wider">
                Mood Distribution
              </h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={moodData} dataKey="value" nameKey="name" outerRadius={90} label>
                      {moodData.map((entry, index) => (
                        <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="lg:col-span-2 bg-bg-secondary/70 border border-white/10 rounded-2xl p-4">
              <h3 className="text-sm font-medium text-text-secondary mb-3 uppercase tracking-wider">
                Drift Summary
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                {['valence', 'arousal', 'trust', 'intimacy'].map((key) => (
                  <div key={key} className="bg-bg-tertiary/60 border border-white/5 rounded-lg p-3">
                    <div className="text-xs text-text-secondary uppercase">{key}</div>
                    <div className="text-sm font-mono mt-1">
                      {result.start_state[key]?.toFixed(2)} → {result.end_state[key]?.toFixed(2)}
                    </div>
                    <div className="text-xs text-text-secondary mt-1">
                      {formatNumber(result.drift_vector[key] ?? 0)}
                    </div>
                  </div>
                ))}
                <div className="bg-bg-tertiary/60 border border-white/5 rounded-lg p-3">
                  <div className="text-xs text-text-secondary uppercase">Stability</div>
                  <div className="text-sm font-mono mt-1">{result.stability_score.toFixed(2)}</div>
                </div>
                <div className="bg-bg-tertiary/60 border border-white/5 rounded-lg p-3">
                  <div className="text-xs text-text-secondary uppercase">Recovery</div>
                  <div className="text-sm font-mono mt-1">{result.recovery_rate.toFixed(2)}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-bg-secondary/70 border border-white/10 rounded-2xl p-4">
            <h3 className="text-sm font-medium text-text-secondary mb-3 uppercase tracking-wider">
              Mood Shift vs Baseline
            </h3>
            {!personality ? (
              <div className="text-sm text-text-secondary">Select an agent to load mood baseline.</div>
            ) : moodShiftData.length === 0 ? (
              <div className="text-sm text-text-secondary">No mood weight data available.</div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={moodShiftData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="mood" tick={{ fill: '#9ca3af' }} interval={0} angle={-25} height={60} />
                    <YAxis tick={{ fill: '#9ca3af' }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="baseline" fill="#60a5fa" name="Baseline" />
                    <Bar dataKey="final" fill="#f472b6" name="Final" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="bg-bg-secondary/70 border border-white/10 rounded-2xl p-4">
            <h3 className="text-sm font-medium text-text-secondary mb-3 uppercase tracking-wider">
              Top 5 Moods Over Time
            </h3>
            {topMoodSeries.moods.length === 0 ? (
              <div className="text-sm text-text-secondary">No mood weight data available.</div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={topMoodSeries.series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="day" tick={{ fill: '#9ca3af' }} />
                    <YAxis tick={{ fill: '#9ca3af' }} />
                    <Tooltip />
                    <Legend />
                    {topMoodSeries.moods.map((mood, index) => (
                      <Line
                        key={mood}
                        type="monotone"
                        dataKey={mood}
                        stroke={COLORS[index % COLORS.length]}
                        strokeWidth={2}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="bg-bg-secondary/70 border border-white/10 rounded-2xl p-4">
            <h3 className="text-sm font-medium text-text-secondary mb-3 uppercase tracking-wider">
              Trigger Impact
            </h3>
            {topTriggers.length === 0 ? (
              <div className="text-sm text-text-secondary">No triggers recorded.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-text-secondary uppercase">
                    <tr>
                      <th className="text-left py-2 px-2">Trigger</th>
                      <th className="text-right py-2 px-2">Count</th>
                      <th className="text-right py-2 px-2">Avg ΔVal</th>
                      <th className="text-right py-2 px-2">Avg ΔAro</th>
                      <th className="text-right py-2 px-2">Avg ΔTrust</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topTriggers.map((t) => (
                      <tr key={t.trigger} className="border-t border-white/5">
                        <td className="py-2 px-2">{t.trigger}</td>
                        <td className="py-2 px-2 text-right">{t.count}</td>
                        <td className="py-2 px-2 text-right">{formatNumber(t.avg_valence_delta)}</td>
                        <td className="py-2 px-2 text-right">{formatNumber(t.avg_arousal_delta)}</td>
                        <td className="py-2 px-2 text-right">{formatNumber(t.avg_trust_delta)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-bg-secondary/70 border border-white/10 rounded-2xl p-4">
            <h3 className="text-sm font-medium text-text-secondary mb-3 uppercase tracking-wider">
              Significant Events
            </h3>
            {events.length === 0 ? (
              <div className="text-sm text-text-secondary">No notable events detected.</div>
            ) : (
              <ul className="space-y-2 text-sm">
                {events.slice(0, 12).map((event, idx) => (
                  <li key={`${event.event}-${idx}`} className="flex gap-2">
                    <span className="text-text-secondary">Day {event.day + 1}:</span>
                    <span>{event.details}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {comparison && (
        <div className="space-y-4">
          <div className="bg-bg-secondary/70 border border-white/10 rounded-2xl p-4">
            <h3 className="text-sm font-medium text-text-secondary mb-3 uppercase tracking-wider">
              Valence Comparison
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={comparisonChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="day" tick={{ fill: '#9ca3af' }} />
                  <YAxis domain={[-1, 1]} tick={{ fill: '#9ca3af' }} />
                  <Tooltip />
                  <Legend />
                  {comparison.comparisons.map((entry, index) => (
                    <Line
                      key={entry.archetype}
                      type="monotone"
                      dataKey={entry.archetype}
                      stroke={COLORS[index % COLORS.length]}
                      strokeWidth={2}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-bg-secondary/70 border border-white/10 rounded-2xl p-4">
            <h3 className="text-sm font-medium text-text-secondary mb-3 uppercase tracking-wider">
              Final State Comparison
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-text-secondary uppercase">
                  <tr>
                    <th className="text-left py-2 px-2">Archetype</th>
                    <th className="text-right py-2 px-2">Valence</th>
                    <th className="text-right py-2 px-2">Arousal</th>
                    <th className="text-right py-2 px-2">Trust</th>
                    <th className="text-right py-2 px-2">Intimacy</th>
                    <th className="text-right py-2 px-2">Stability</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.comparisons.map((entry) => (
                    <tr key={entry.archetype} className="border-t border-white/5">
                      <td className="py-2 px-2">{entry.archetype}</td>
                      <td className="py-2 px-2 text-right">{entry.result.end_state.valence?.toFixed(2)}</td>
                      <td className="py-2 px-2 text-right">{entry.result.end_state.arousal?.toFixed(2)}</td>
                      <td className="py-2 px-2 text-right">{entry.result.end_state.trust?.toFixed(2)}</td>
                      <td className="py-2 px-2 text-right">{entry.result.end_state.intimacy?.toFixed(2)}</td>
                      <td className="py-2 px-2 text-right">{entry.result.stability_score.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DriftSimulatorTab;
