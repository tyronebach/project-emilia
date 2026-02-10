import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Sliders, Bug, Palette } from 'lucide-react';
import AppTopNav from '../AppTopNav';
import DesignerTabsV2 from './DesignerTabsV2';
import PersonalityTab from './PersonalityTab';
import BondsTab from './BondsTab';
import CalibrationTab from './CalibrationTab';
import SimulatorTab from './SimulatorTab';
import DriftSimulatorTab from './DriftSimulatorTab';

export type DesignerV2Tab = 'personality' | 'bonds' | 'calibration' | 'simulator' | 'drift';

function DesignerPageV2() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<DesignerV2Tab>('personality');

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
              onClick={() => navigate({ to: '/designer-v2' })}
              className="p-2 rounded-xl bg-bg-secondary/70 border border-white/10 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/80 transition-colors"
              title="Agent Designer"
            >
              <Palette className="w-5 h-5" />
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

      <DesignerTabsV2 activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="flex-1 p-6 max-w-5xl mx-auto w-full">
        {activeTab === 'personality' && <PersonalityTab />}
        {activeTab === 'bonds' && <BondsTab />}
        {activeTab === 'calibration' && <CalibrationTab />}
        {activeTab === 'simulator' && <SimulatorTab />}
        {activeTab === 'drift' && <DriftSimulatorTab />}
      </div>
    </div>
  );
}

export default DesignerPageV2;
