import type { DesignerV2Tab } from './DesignerPageV2';

const tabs: { id: DesignerV2Tab; label: string }[] = [
  { id: 'personality', label: 'Personality' },
  { id: 'bonds', label: 'Bonds' },
  { id: 'calibration', label: 'Calibration' },
  { id: 'simulator', label: 'Simulator' },
  { id: 'drift', label: 'Drift' },
  { id: 'dynamics', label: 'Dynamics' },
];

interface DesignerTabsV2Props {
  activeTab: DesignerV2Tab;
  onTabChange: (tab: DesignerV2Tab) => void;
}

function DesignerTabsV2({ activeTab, onTabChange }: DesignerTabsV2Props) {
  return (
    <div className="sticky top-0 z-10 bg-bg-primary border-b border-white/10">
      <div className="flex gap-1 px-6 max-w-5xl mx-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
              activeTab === tab.id
                ? 'border-accent text-text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default DesignerTabsV2;
