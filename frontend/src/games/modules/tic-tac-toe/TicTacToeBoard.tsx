import type { GameRendererProps } from '../../types';
import { cn } from '../../../lib/utils';
import { POSITION_LABELS, type TicTacToeState } from './TicTacToeModule';

function TicTacToeBoard({
  state,
  currentTurn,
  validMoves,
  onUserMove,
  isAvatarThinking,
  moveHistory,
}: GameRendererProps<TicTacToeState, number>) {
  const isUserTurn = currentTurn === 'user';
  const lastMove = moveHistory.length ? moveHistory[moveHistory.length - 1].move : null;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="grid grid-cols-3 gap-2">
        {state.board.map((cell, index) => {
          const isValid = isUserTurn && validMoves.includes(index);
          const isLastMove = typeof lastMove === 'number' && lastMove === index;
          const isWinningCell = state.winningLine?.includes(index) ?? false;

          return (
            <button
              key={index}
              type="button"
              onClick={() => {
                if (isValid) onUserMove(index);
              }}
              disabled={!isValid}
              aria-label={`Cell ${index + 1} ${POSITION_LABELS[index]}${cell ? ` occupied by ${cell}` : ''}`}
              className={cn(
                'h-20 w-20 md:h-24 md:w-24 rounded-xl flex items-center justify-center text-3xl md:text-4xl font-display font-semibold border border-white/10 transition-colors',
                cell === 'X' && 'text-sky-300',
                cell === 'O' && 'text-pink-300',
                !cell && 'text-text-secondary/40',
                isValid ? 'bg-white/5 hover:bg-white/15 cursor-pointer' : 'bg-white/5 cursor-default opacity-70',
                isLastMove && 'ring-2 ring-accent/60',
                isWinningCell && 'bg-success/15 border-success/40',
              )}
            >
              {cell ?? ''}
            </button>
          );
        })}
      </div>

      {isAvatarThinking && (
        <div className="text-xs text-text-secondary">Avatar is thinking...</div>
      )}
    </div>
  );
}

export default TicTacToeBoard;
