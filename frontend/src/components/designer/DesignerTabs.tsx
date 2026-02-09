import type { DesignerTab } from './DesignerPage';

const tabs: { id: DesignerTab; label: string }[] = [
  { id: 'agents', label: 'Agents' },
  { id: 'moods', label: 'Moods' },
  { id: 'relationships', label: 'Relationships' },
];

interface DesignerTabsProps {
  activeTab: DesignerTab;
  onTabChange: (tab: DesignerTab) => void;
}

function DesignerTabs({ activeTab, onTabChange }: DesignerTabsProps) {
  return (
    <div className="sticky top-0 z-10 bg-bg-primary border-b border-white/10">
      <div className="flex gap-1 px-6 max-w-4xl mx-auto">
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

export default DesignerTabs;
