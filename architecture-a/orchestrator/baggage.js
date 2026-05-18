/**
 * W3C Baggage helpers (Layer 1).
 *
 * The W3C Baggage spec encodes key=value pairs in the `baggage` HTTP header.
 * We write gpc=1 into that header at the orchestrator entry point so the
 * signal propagates automatically on every outbound HTTP call without any
 * per-agent forwarding code.
 *
 * Reference: https://www.w3.org/TR/baggage/
 */

/**
 * Encode an object of key/value pairs into a W3C Baggage header value.
 * e.g. { gpc: '1', session: 'abc' }  →  "gpc=1,session=abc"
 */
function encodeBaggage(entries) {
  return Object.entries(entries)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join(',');
}

/**
 * Decode a W3C Baggage header value into a plain object.
 * "gpc=1,session=abc"  →  { gpc: '1', session: 'abc' }
 */
function decodeBaggage(header) {
  if (!header) return {};
  return Object.fromEntries(
    header.split(',').map((item) => {
      const [k, ...rest] = item.trim().split('=');
      return [decodeURIComponent(k), decodeURIComponent(rest.join('='))];
    })
  );
}

/**
 * Read the gpc flag from a baggage header value.
 * Returns true if gpc=1 is present.
 */
function readGpcFromBaggage(header) {
  return decodeBaggage(header).gpc === '1';
}

module.exports = { encodeBaggage, decodeBaggage, readGpcFromBaggage };
