import { Preferences } from '@capacitor/preferences';

/**
 * Supabase session storage for the native apps.
 * iOS can clear a web view's localStorage under storage pressure, which would sign people
 * out; Preferences (UserDefaults / SharedPreferences) survives that. localStorage is kept
 * as a mirror so code that reads it synchronously still sees the session.
 */
export const nativeAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    const { value } = await Preferences.get({ key });
    if (value !== null) return value;
    try {
      const legacy = window.localStorage.getItem(key);
      if (legacy !== null) await Preferences.set({ key, value: legacy });
      return legacy;
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    await Preferences.set({ key, value });
    try { window.localStorage.setItem(key, value); } catch { /* storage full or blocked */ }
  },
  async removeItem(key: string): Promise<void> {
    await Preferences.remove({ key });
    try { window.localStorage.removeItem(key); } catch { /* ignore */ }
  },
};
