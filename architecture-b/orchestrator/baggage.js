/**
 * W3C Baggage helpers — identical role to Architecture A.
 *
 * The GPC signal is read from the `baggage` HTTP header at the orchestrator
 * entry point.  The spec also supports encoding gpc_scope (partial opt-out)
 * as an additional baggage member: e.g. "gpc=1,gpc_scope=ad_targeting%7Cmodel_training"
 */

function encodeBaggage(entries) {
  return Object.entries(entries)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join(',');
}

function decodeBaggage(header) {
  if (!header) return {};
  return Object.fromEntries(
    header.split(',').map((item) => {
      const [k, ...rest] = item.trim().split('=');
      return [decodeURIComponent(k), decodeURIComponent(rest.join('='))];
    })
  );
}

function readGpcFromBaggage(header) {
  const parsed = decodeBaggage(header);
  const gpc = parsed.gpc === '1';
  // gpc_scope is a pipe-delimited list of purposes to restrict (partial opt-out)
  const gpc_scope = parsed.gpc_scope
    ? parsed.gpc_scope.split('|').filter(Boolean)
    : null;
  return { gpc, gpc_scope };
}

module.exports = { encodeBaggage, decodeBaggage, readGpcFromBaggage };
