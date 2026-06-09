import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export async function triggerHaptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'error') {
  try {
    // Try Capacitor native/hybrid haptics first
    if (type === 'light') {
      await Haptics.impact({ style: ImpactStyle.Light });
    } else if (type === 'medium') {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } else if (type === 'heavy') {
      await Haptics.impact({ style: ImpactStyle.Heavy });
    } else if (type === 'success') {
      await Haptics.notification({ type: NotificationType.Success });
    } else if (type === 'error') {
      await Haptics.notification({ type: NotificationType.Error });
    }
  } catch (err) {
    // Fallback to standard web vibration API
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        if (type === 'light') {
          navigator.vibrate(15);
        } else if (type === 'medium') {
          navigator.vibrate(35);
        } else if (type === 'heavy') {
          navigator.vibrate(70);
        } else if (type === 'success') {
          navigator.vibrate([60, 40, 60]);
        } else if (type === 'error') {
          navigator.vibrate([100, 60, 100]);
        }
      } catch (vibrateErr) {
        // Ignore any browser-level interaction blocks
      }
    }
  }
}
