import type { GameLoaderContract } from '../../types';
import { chessModule } from './ChessModule';

export const loaderContract: GameLoaderContract = {
  id: 'chess',
  load: async () => chessModule,
};

export default loaderContract;
