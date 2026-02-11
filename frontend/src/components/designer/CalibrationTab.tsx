import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, RotateCcw, Users, Bot } from 'lucide-react';
import { Button } from '../ui/button';
import { getPersonalities, getBonds, getCalibration, resetCalibration } from '../../utils/designerApiV2';
import CalibrationCard from './CalibrationCard';
import CalibrationHeatmap from './CalibrationHeatmap';
import DeleteConfirmDialog from './DeleteConfirmDialog';
import { HelpDot } from './Tooltip';

function CalibrationTab() {
  const queryClient = useQueryClient();
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [confirmResetAll, setConfirmResetAll] = useState(false);

  // Fetch agent list
  const { data: agents, isLoading: agentsLoading } = useQuery({
    queryKey: ['designer-v2', 'personalities'],
    queryFn: getPersonalities,
  });

  // Fetch bonds (users) for selected agent
  const { data: bonds, isLoading: bondsLoading } = useQuery({
    queryKey: ['designer-v2', 'bonds', selectedAgentId],
    queryFn: () => getBonds(selectedAgentId),
    enabled: !!selectedAgentId,
  });

  // Reset user selection when agent changes
  const handleAgentChange = (agentId: string) => {
    setSelectedAgentId(agentId);
    setSelectedUserId('');
  };

  // Fetch calibration data
  const {
    data: profile,
    isLoading: calibrationLoading,
    error: calibrationError,
  } = useQuery({
    queryKey: ['designer-v2', 'calibration', selectedUserId, selectedAgentId],
    queryFn: () => getCalibration(selectedUserId, selectedAgentId),
    enabled: !!selectedUserId && !!selectedAgentId,
  });

  // Reset single trigger
  const resetTriggerMut = useMutation({
    mutationFn: (triggerType: string) => resetCalibration(selectedUserId, selectedAgentId, triggerType),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['designer-v2', 'calibration', selectedUserId, selectedAgentId],
      });
    },
  });

  // Reset all calibrations
  const resetAllMut = useMutation({
    mutationFn: () => resetCalibration(selectedUserId, selectedAgentId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['designer-v2', 'calibration', selectedUserId, selectedAgentId],
      });
      setConfirmResetAll(false);
    },
  });

  const calibrations = profile?.calibrations ?? [];

  return (
    <div>
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-lg font-display text-text-primary">
          Trigger Calibration
          <HelpDot tip="The system learns how each user responds to different triggers and adjusts intensity over time." />
        </h2>
        <p className="text-sm text-text-secondary mt-1">
          The agent learns what works for each user. If amusement or banter style signals consistently get a negative reaction, the agent dials them down. If admiration or caring signals consistently land well, it leans in harder. This page shows the learned multipliers.
        </p>
      </div>

      {/* Selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {/* Agent Selector */}
        <div>
          <label className="flex items-center gap-1.5 text-xs text-text-secondary mb-1.5">
            <Bot className="w-3 h-3" />
            Agent
          </label>
          <select
            value={selectedAgentId}
            onChange={(e) => handleAgentChange(e.target.value)}
            className="w-full bg-bg-tertiary border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none appearance-none"
            disabled={agentsLoading}
          >
            <option value="">
              {agentsLoading ? 'Loading agents...' : 'Select an agent'}
            </option>
            {agents?.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </div>

        {/* User Selector */}
        <div>
          <label className="flex items-center gap-1.5 text-xs text-text-secondary mb-1.5">
            <Users className="w-3 h-3" />
            User
          </label>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="w-full bg-bg-tertiary border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none appearance-none"
            disabled={!selectedAgentId || bondsLoading}
          >
            <option value="">
              {!selectedAgentId
                ? 'Select an agent first'
                : bondsLoading
                  ? 'Loading users...'
                  : 'Select a user'}
            </option>
            {bonds?.map((bond) => (
              <option key={bond.user_id} value={bond.user_id}>
                {bond.user_id} (trust: {(bond.trust * 100).toFixed(0)}%, {bond.interaction_count} interactions)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Empty state: nothing selected */}
      {(!selectedAgentId || !selectedUserId) && (
        <div className="text-center py-12 text-text-secondary">
          <p className="text-sm">Select an agent and user to view their calibration profile.</p>
        </div>
      )}

      {/* Loading */}
      {selectedAgentId && selectedUserId && calibrationLoading && (
        <div className="text-center py-8 text-text-secondary">Loading calibration data...</div>
      )}

      {/* Error */}
      {calibrationError && (
        <div className="p-3 bg-error/10 border border-error/30 rounded-lg flex items-center gap-2 text-error text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Failed to load calibration data
        </div>
      )}

      {/* Calibration Data */}
      {profile && !calibrationLoading && (
        <div className="space-y-6">
          {/* Summary Header */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-text-secondary">
              {calibrations.length} calibrated triggers &middot; {profile.total_interactions} total interactions
            </p>
            {calibrations.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-error hover:text-error"
                onClick={() => setConfirmResetAll(true)}
                disabled={resetAllMut.isPending}
              >
                <RotateCcw className="w-4 h-4" />
                Reset All
              </Button>
            )}
          </div>

          {/* Heatmap */}
          {calibrations.length > 0 && (
            <CalibrationHeatmap calibrations={calibrations} />
          )}

          {/* Calibration Cards */}
          <div className="space-y-4">
            {calibrations.map((cal) => (
              <CalibrationCard
                key={cal.trigger_type}
                calibration={cal}
                onReset={(triggerType) => resetTriggerMut.mutate(triggerType)}
              />
            ))}
          </div>

          {calibrations.length === 0 && (
            <div className="text-center py-8 text-text-secondary">
              No calibration data for this user-agent pair yet.
            </div>
          )}
        </div>
      )}

      <DeleteConfirmDialog
        open={confirmResetAll}
        onOpenChange={setConfirmResetAll}
        title="Reset all calibrations?"
        description="This will clear all learned trigger calibrations for this user-agent pair. The system will start learning from scratch."
        onConfirm={() => resetAllMut.mutate()}
        loading={resetAllMut.isPending}
      />
    </div>
  );
}

export default CalibrationTab;
