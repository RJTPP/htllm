/**
 * Locality classification for HTTP providers.
 *
 * Classifies the immediate endpoint, not the inference location. Even a
 * loopback endpoint may proxy requests elsewhere. mDNS hosts can be other
 * machines on the LAN and must not be classified as loopback.
 */

export type Locality = 'on-device' | 'off-device' | 'unknown';

/** Localhost / loopback hosts for the immediate request. */
const ON_DEVICE_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
]);

/**
 * True for an immediate loopback endpoint. This does not guarantee that
 * the endpoint keeps the request or inference on this machine.
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
