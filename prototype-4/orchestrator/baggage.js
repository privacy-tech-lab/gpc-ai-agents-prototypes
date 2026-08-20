/**
 * W3C Baggage helpers (Layer 1).
 *
 * The orchestrator reads the `baggage` HTTP header at request entry so
 * the GPC bit propagates on every outbound publisher call without
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
 * Decode a W3C Baggage header value into a plain object. Returns {}
 * for any non-string input (null, undefined, number, object). Callers
 * do not need to defensively coerce: a baggage header that is not a
 * string is, by definition, absent.
 */
function decodeBaggage(header) {
  if (typeof header !== 'string' || !header) return {};
  return Object.fromEntries(
    header.split(',').map((item) => {
      const [k, ...rest] = item.trim().split('=');
      return [decodeURIComponent(k), decodeURIComponent(rest.join('='))];
    })
  );
}

/**
 * True iff gpc=1 is present in the baggage header value.
 */
function readGpcFromBaggage(header) {
  return decodeBaggage(header).gpc === '1';
}

module.exports = { encodeBaggage, decodeBaggage, readGpcFromBaggage };
