import GameWindowManager from '../games/ui/GameWindowManager';
import { GAMES_V2_ENABLED } from '../config/features';

function GamePanel() {
  if (!GAMES_V2_ENABLED) {
    return null;
  }

  return <GameWindowManager />;
}

export default GamePanel;
