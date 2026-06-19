/**
 * Central registry of "secondary" purposes that are subject to GPC
 * enforcement under withPurposeCheck().
 *
 * The PRIMARY purpose — answering the patient's question using their
 * retrieved records — is intentionally NOT in this registry. It is the
 * one purpose that always proceeds, GPC or not. That's the crux of
 * Architecture B: the retrieval tool itself is never blocked; only the
 * secondary uses of its output are.
 */

const PRIMARY_PURPOSE = 'patient_response';

const RESTRICTABLE_PURPOSES = [
  'analytics',
  'model_training',
  'ad_targeting',
];

module.exports = {
  PRIMARY_PURPOSE,
  RESTRICTABLE_PURPOSES,
  RESTRICTABLE_PURPOSES_SET: new Set(RESTRICTABLE_PURPOSES),
};
