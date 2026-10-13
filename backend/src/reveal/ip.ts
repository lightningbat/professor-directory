import net from 'node:net';

function expandIpv6(addr: string): string[] {
  const [head = '', tail] = addr.split('%')[0]!.split('::');
  const h = head ? head.split(':') : [];
  if (tail === undefined) return h.map((g) => g.padStart(4, '0'));
  const t = tail ? tail.split(':') : [];
  return [...h, ...Array<string>(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t].map((g) => g.padStart(4, '0'));
}

/**
 * The key used for per-IP limits. IPv4-mapped IPv6 addresses collapse to plain IPv4, and IPv6
 * clients are grouped by /64, because one machine can cheaply hop between addresses inside it.
 */
export function ipKey(raw: string | undefined): string {
  if (!raw) return 'unknown';
  const ip = raw.toLowerCase().startsWith('::ffff:') && net.isIPv4(raw.slice(7)) ? raw.slice(7) : raw;
  if (net.isIPv6(ip)) return `${expandIpv6(ip).slice(0, 4).join(':')}::/64`;
  return ip;
}
