import { PushNotifications, type PushNotificationSchema, type ActionPerformed } from '@capacitor/push-notifications';
import { supabase } from '../../utils/supabase';
import { nativePlatform, nativePushEnabled, navigateTo } from './platform';
import { mapAppRoute } from './deepLinks';

/**
 * Native push for the Capacitor apps.
 *
 * OFF by default (VITE_NATIVE_PUSH !== 'true'). The live Expo app's tokens go through Expo's
 * push service; Capacitor tokens are APNs (iOS) / FCM (Android) tokens, which
 * send-push-notification cannot deliver to yet. Turn this on once the edge function sends by
 * provider (see MOBILE.md → Push).
 */

let registered = false;
let currentToken: string | null = null;

export async function initNativePush() {
  if (!nativePushEnabled || registered) return;
  registered = true;

  await PushNotifications.addListener('registration', async ({ value }) => {
    currentToken = value;
    await saveToken(value);
  });

  await PushNotifications.addListener('registrationError', (err) => {
    console.warn('[push] registration failed', err);
  });

  // Foreground notifications: the in-app NotificationContext already shows toasts for new
  // rows in `notifications`, so nothing extra here.
  await PushNotifications.addListener('pushNotificationReceived', (_n: PushNotificationSchema) => {});

  // Tapping a notification opens the route the server attached (Expo-era routes are mapped).
  await PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
    const route = (action.notification.data?.route as string | undefined) ?? '/';
    navigateTo(mapAppRoute(route));
  });

  // Register when signed in; re-save the token if the account changes.
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' && currentToken) void saveToken(currentToken);
    if (event === 'SIGNED_OUT' && currentToken) void deactivateToken(currentToken);
  });

  const { data } = await supabase.auth.getSession();
  if (data.session) await requestAndRegister();
}

/** Asks for permission (iOS shows the system prompt once) and registers with APNs/FCM. */
export async function requestAndRegister(): Promise<boolean> {
  if (!nativePushEnabled) return false;
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== 'granted') return false;
  await PushNotifications.register();
  return true;
}

async function saveToken(token: string) {
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return;
  // Same table as the Expo app. `platform` distinguishes the new token kinds until a
  // `provider` column exists: 'ios-apns' / 'android-fcm' vs the Expo app's 'ios'.
  const platform = nativePlatform === 'ios' ? 'ios-apns' : 'android-fcm';
  const now = new Date().toISOString();
  // A device token belongs to one account at a time
  await supabase.from('push_tokens').update({ active: false, updated_at: now }).eq('token', token).neq('user_id', userId);
  const { data: existing } = await supabase.from('push_tokens').select('id').eq('token', token).eq('user_id', userId).maybeSingle();
  if (existing) {
    await supabase.from('push_tokens').update({ active: true, platform, updated_at: now }).eq('id', existing.id);
  } else {
    await supabase.from('push_tokens').insert({ user_id: userId, token, platform, active: true });
  }
}

async function deactivateToken(token: string) {
  await supabase.from('push_tokens').update({ active: false, updated_at: new Date().toISOString() }).eq('token', token);
}
