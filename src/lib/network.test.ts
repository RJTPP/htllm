import { describe, expect, it } from 'vitest';
import { isOnDeviceUrl, localityOf } from './network';

describe('endpoint locality', () => {
  it('recognizes loopback endpoints without claiming where inference runs', () => {
    for (const url of ['http://localhost:1234/v1', 'http://127.0.0.1:1234', 'http://[::1]:1234']) {
      expect(isOnDeviceUrl(url)).toBe(true);
    }
  });
  it('treats LAN and mDNS endpoints as remote', () => {
    for (const url of ['http://server.local:1234', 'http://192.168.1.2:1234', 'https://example.com/v1']) {
      expect(localityOf(url)).toBe('off-device');
    }
  });
  it('does not assert locality for an unset endpoint', () => {
    expect(localityOf('')).toBe('unknown');
    expect(isOnDeviceUrl('not a URL')).toBe(false);
  });
});
