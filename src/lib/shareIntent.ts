import { requireOptionalNativeModule } from 'expo';
import { useEffect } from 'react';

// Text shared into PerkScan from another Android app. The native module only exists
// in an installed Android build; on iOS, web and Expo Go this does nothing.

interface ShareTextModule {
  takeSharedText(): string | null;
  addListener(event: 'onShare', listener: (e: { text: string }) => void): { remove(): void };
}

const ShareText = requireOptionalNativeModule<ShareTextModule>('ShareText');

export const canReceiveShares = ShareText !== null;

/** Calls onText for a share that opened the app, and for each share while it's open. */
export function useSharedText(enabled: boolean, onText: (text: string) => void) {
  useEffect(() => {
    if (!ShareText || !enabled) return;
    const take = () => {
      const text = ShareText.takeSharedText();
      if (text) onText(text);
    };
    take();
    const sub = ShareText.addListener('onShare', take);
    return () => sub.remove();
  }, [enabled, onText]);
}
