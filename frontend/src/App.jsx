import { AppProvider } from './context/AppContext';
import Header from './components/Header';
import AvatarPanel from './components/AvatarPanel';
import ChatPanel from './components/ChatPanel';
import InputControls from './components/InputControls';

function App() {
  return (
    <AppProvider>
      <div className="min-h-screen bg-bg-primary text-text-primary flex flex-col">
        <Header />
        <main className="flex-1 flex flex-col p-2 gap-2 md:p-4 md:gap-4 overflow-hidden">
          <AvatarPanel />
          <ChatPanel />
          <InputControls />
        </main>
      </div>
    </AppProvider>
  );
}

export default App;
