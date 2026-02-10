import type { GameLoaderContract } from '../../types';
import { ticTacToeModule } from './TicTacToeModule';

export const loaderContract: GameLoaderContract = {
  id: 'tic-tac-toe',
  load: async () => ticTacToeModule,
};

export default loaderContract;
