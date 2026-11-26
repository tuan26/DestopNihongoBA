import type { VocabWithReview } from '../../core/vocabulary/types';

export interface GameOutcome {
  score: number;
  correct: number;
  total: number;
  durationMs: number;
  wrong: VocabWithReview[];
}

export interface GameProps {
  pool: VocabWithReview[];
  onFinish: (o: GameOutcome) => void;
}
