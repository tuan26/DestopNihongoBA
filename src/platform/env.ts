export const isTauri = (): boolean =>
  typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

/** Which UI to render in this webview: the floating card or the main window. */
export function currentWindowKind(): 'card' | 'main' {
  if (typeof window === 'undefined') return 'main';
  const params = new URLSearchParams(window.location.search);
  if (params.get('window') === 'card') return 'card';
  if (isTauri()) {
    const label = (window as unknown as { __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } } })
      .__TAURI_INTERNALS__?.metadata?.currentWindow?.label;
    if (label === 'card') return 'card';
  }
  return 'main';
}
