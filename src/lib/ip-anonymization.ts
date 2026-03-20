/**
 * GDPR-compliant IP address anonymization
 *
 * Truncates the last octet of IPv4 addresses and the last 80 bits of IPv6 addresses.
 * The anonymized IP still provides rough uniqueness for visitor counting
 * without being personally identifiable.
 */
export function anonymizeIp(ip: string): string {
  if (!ip) return ''

  // IPv4: "192.168.1.42" → "192.168.1.0"
  if (ip.includes('.') && !ip.includes(':')) {
    const parts = ip.split('.')
    if (parts.length === 4) {
      parts[3] = '0'
      return parts.join('.')
    }
    return ip
  }

  // IPv6: zero out last 80 bits (last 5 groups)
  // "2001:0db8:85a3:0000:0000:8a2e:0370:7334" → "2001:0db8:85a3:0:0:0:0:0"
  const groups = ip.split(':')
  if (groups.length >= 6) {
    for (let i = 3; i < groups.length; i++) {
      groups[i] = '0'
    }
    return groups.join(':')
  }

  // IPv4-mapped IPv6: "::ffff:192.168.1.42" → "::ffff:192.168.1.0"
  if (ip.startsWith('::ffff:')) {
    const ipv4Part = ip.substring(7)
    return '::ffff:' + anonymizeIp(ipv4Part)
  }

  return ip
}
