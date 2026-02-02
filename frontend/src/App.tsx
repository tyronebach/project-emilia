import { useState } from 'react';
import { AppProvider } from './context/AppContext';
import Header from './components/Header';
import Drawer from './components/Drawer';
import AvatarPanel from './components/AvatarPanel';
import ChatPanel from './components/ChatPanel';
import InputControls from './components/InputControls';
import DebugPanel from './components/DebugPanel';
import MemoryModal from './components/MemoryModal';

/**
 * Main App Layout
 * 
 * Structure:
 * - Full-screen avatar background
 * - Header overlay at top (with drawer toggle + debug/memory buttons)
 * - Chat history overlay on bottom half (semi-transparent)
 * - Floating input bar at bottom
 * - Side drawer for sessions/settings
 * - Debug panel (right side modal)
 * - Memory modal (top half modal)
 */
function App() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);

  return (
    <AppProvider>
      <div className="h-screen w-screen bg-bg-primary text-text-primary overflow-hidden relative">
        {/* Full-screen Avatar Background */}
        <AvatarPanel />

        {/* Header Overlay */}
        <Header 
          onMenuClick={() => setDrawerOpen(true)} 
          onDebugClick={() => setDebugOpen(!debugOpen)}
          onMemoryClick={() => setMemoryOpen(!memoryOpen)}
          debugOpen={debugOpen}
          memoryOpen={memoryOpen}
        />

        {/* Chat History Overlay (bottom half) */}
        <ChatPanel />

        {/* Floating Input Bar */}
        <InputControls />

        {/* Side Drawer */}
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

        {/* Debug Panel */}
        <DebugPanel open={debugOpen} onClose={() => setDebugOpen(false)} />

        {/* Memory Modal */}
        <MemoryModal open={memoryOpen} onClose={() => setMemoryOpen(false)} />
      </div>
    </AppProvider>
  );
}

export default App;
