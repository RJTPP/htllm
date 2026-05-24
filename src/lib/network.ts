/**
 * Locality classification for HTTP providers.
 *
 * The honest definition for users: "does my data leave this browser to
 * another machine?" — so we treat anything that isn't a loopback / mDNS
 * host as off-device. LAN IPs (192.168.x, 10.x, …) are explicitly
 * off-device too: the data physically leaves this machine.
 */

export type Locality = 'on-device' | 'off-device' | 'unknown';

/** Localhost / loopback / mDNS hosts that keep the request on this device. */
const ON_DEVICE_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
]);

/**
 * True when a request to this URL stays on the current machine. Loopback
 * addresses and *.local (mDNS) only; anything else — including private
 * RFC1918 LAN IPs — counts as leaving the device.
 */
export function isOnDeviceUrl(url: string): boolean {
  if (!url || !url.trim()) return false;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (ON_DEVICE_HOSTS.has(host)) return true;
  if (host.endsWith('.local')) return true; // Bonjour / mDNS
  return false;
}

/**
 * Three-state classification. `unknown` is returned for empty / unset
 * URLs so the UI can omit the badge instead of asserting one way.
 */
export function localityOf(url: string | null | undefined): Locality {
  if (!url || !url.trim()) return 'unknown';
  return isOnDeviceUrl(url) ? 'on-device' : 'off-device';
}
