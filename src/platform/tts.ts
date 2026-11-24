/** Japanese pronunciation through the OS text-to-speech voices (offline on Windows). */
export function speakJapanese(text: string, rate = 0.9): { ok: boolean; message?: string } {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return { ok: false, message: 'Thiết bị không hỗ trợ đọc văn bản (TTS).' };
  }
  const synth = window.speechSynthesis;
  const voices = synth.getVoices();
  const ja = voices.find((v) => v.lang?.toLowerCase().startsWith('ja'));
  if (voices.length > 0 && !ja) {
    return {
      ok: false,
      message: 'Chưa có giọng đọc tiếng Nhật. Vào Windows Settings › Time & language › Speech › Add voices › 日本語.',
    };
  }
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP';
  u.rate = rate;
  if (ja) u.voice = ja;
  synth.speak(u);
  return { ok: true };
}

// Some engines load voices asynchronously.
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.getVoices();
}
