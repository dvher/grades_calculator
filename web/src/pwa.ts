import { registerSW } from "virtual:pwa-register";

/**
 * Makes the app installable and usable offline. Service workers only run on HTTPS or localhost;
 * elsewhere this is a no-op and the app still works while the page is open.
 */
export function registerOffline() {
  if ("serviceWorker" in navigator && window.isSecureContext) {
    registerSW({ immediate: true });
  }
  // Ask the browser not to evict our localStorage under storage pressure.
  void navigator.storage?.persist?.().catch(() => {});
}
