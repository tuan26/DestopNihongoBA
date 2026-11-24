import type { FrontKind } from '../core/study/modes';
import { maskTarget } from '../core/study/modes';
import type { VocabWithReview } from '../core/vocabulary/types';
import { CATEGORY_LABELS_VI, DIFFICULTY_LABELS_VI } from '../core/vocabulary/types';
import { speakJapanese } from '../platform/tts';

export function FlashCard({
  word,
  front,
  revealed,
  onReveal,
  onSpeakError,
}: {
  word: VocabWithReview;
  front: FrontKind;
  revealed: boolean;
  onReveal: () => void;
  onSpeakError?: (m: string) => void;
}) {
  const speak = () => {
    const r = speakJapanese(word.reading || word.japanese);
    if (!r.ok && r.message) onSpeakError?.(r.message);
  };
  const ctx = front === 'context' ? maskTarget(word.example_ja ?? '', word.japanese) : null;
  return (
    <div className="card flash" data-testid="flashcard">
      <div className="row small muted" style={{ justifyContent: 'center' }}>
        <span className="badge">{CATEGORY_LABELS_VI[word.category] ?? word.category}</span>
        {word.subcategory && <span className="badge">{word.subcategory}</span>}
        <span className="badge badge-primary">{DIFFICULTY_LABELS_VI[word.difficulty] ?? word.difficulty}</span>
        {word.review?.state === 0 && <span className="badge badge-good">Từ mới</span>}
      </div>

      {front === 'ja' && <div className="flash-word">{word.japanese}</div>}
      {front === 'kanji' && <div className="flash-word">{word.japanese}</div>}
      {front === 'vi' && <div className="flash-meaning" style={{ fontSize: '1.6em' }}>{word.vietnamese}</div>}
      {front === 'context' && ctx && (
        <>
          <div className="flash-context">{ctx.text}</div>
          <div className="muted">{word.example_vi}</div>
        </>
      )}
      {front === 'ja' && !revealed && <div className="flash-reading">{word.reading}</div>}

      {!revealed ? (
        <button className="btn btn-primary btn-lg" onClick={onReveal} data-testid="reveal">
          Hiện đáp án <span className="kbd">Space</span>
        </button>
      ) : (
        <>
          {front !== 'ja' && <div className="flash-word">{word.japanese}</div>}
          <div className="flash-reading">
            {word.reading}{' '}
            <button className="btn btn-ghost btn-sm" onClick={speak} title="Phát âm">
              🔊
            </button>
          </div>
          {front !== 'vi' && <div className="flash-meaning" data-testid="meaning">{word.vietnamese}</div>}
          {word.example_ja && front !== 'context' && (
            <div>
              <div className="flash-example">例：{word.example_ja}</div>
              <div className="flash-example-vi">{word.example_vi}</div>
            </div>
          )}
          {word.usage_note && <div className="flash-note">💡 {word.usage_note}</div>}
          {word.note && <div className="flash-note">📝 {word.note}</div>}
        </>
      )}
    </div>
  );
}
