import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Sliders, Bug } from 'lucide-react';
import AppTopNav from '../AppTopNav';
import DesignerTabs from './DesignerTabs';
import MoodListTab from './MoodListTab';
import AgentListTab from './AgentListTab';
import RelationshipListTab from './RelationshipListTab';

export type DesignerTab = 'agents' | 'moods' | 'relationships';

function DesignerPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<DesignerTab>('agents');

  return (
    <div className="min-h-[100svh] bg-bg-primary text-text-primary flex flex-col">
      <AppTopNav
        onBack={() => navigate({ to: '/' })}
        subtitle="Agent Designer"
        rightSlot={(
          <>
            <button
              onClick={() => navigate({ to: '/manage' })}
              className="p-2 rounded-xl bg-bg-secondary/70 border border-white/10 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/80 transition-colors"
              title="Agent Settings"
            >
              <Sliders className="w-5 h-5" />
            </button>
            <button
              onClick={() => navigate({ to: '/debug' })}
              className="p-2 rounded-xl bg-bg-secondary/70 border border-white/10 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/80 transition-colors"
              title="Debug Avatar"
            >
              <Bug className="w-5 h-5" />
            </button>
          </>
        )}
      />

      <DesignerTabs activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="flex-1 p-6 max-w-4xl mx-auto w-full">
        {activeTab === 'agents' && <AgentListTab />}
        {activeTab === 'moods' && <MoodListTab />}
        {activeTab === 'relationships' && <RelationshipListTab />}
      </div>
    </div>
  );
}

export default DesignerPage;
