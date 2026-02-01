import { AppProvider } from './context/AppContext';
import Header from './components/Header';
import AvatarPanel from './components/AvatarPanel';
import ChatPanel from './components/ChatPanel';
import InputControls from './components/InputControls';
import MobileAccordion from './components/MobileAccordion';
import StatsPanel from './components/StatsPanel';
import MemoryPanel from './components/MemoryPanel';

function App() {
  return (
    <AppProvider>
      <div className="h-screen bg-bg-primary text-text-primary flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 flex flex-col min-h-0 p-2 gap-2">
          {/* Mobile: Accordion layout */}
          <div className="md:hidden flex-1 min-h-0 flex flex-col overflow-hidden">
            <MobileAccordion />
          </div>
          
          {/* Desktop: Side-by-side layout */}
          <div className="hidden md:flex flex-1 min-h-0 gap-4 p-2">
            <div className="flex-1 flex flex-col gap-4 min-h-0">
              <AvatarPanel />
              <ChatPanel />
            </div>
            <div className="w-80 flex flex-col gap-4 shrink-0">
              <StatsPanel />
              <MemoryPanel className="flex-1" />
            </div>
          </div>
          
          <InputControls />
        </main>
      </div>
    </AppProvider>
  );
}

export default App;
