/**
 * Model-training dataset pipeline (secondary purpose: "model_training").
 *
 * Appends (query, response) pairs to a JSONL-style dataset file that would
 * normally be consumed by a fine-tuning job.
 */
const fs = require('fs');
const path = require('path');
const { withPurposeCheck } = require('../lib/withPurposeCheck');
const { RESTRICTABLE_PURPOSES_SET } = require('../lib/purposeRegistry');

const DATASET_FILE = path.join(__dirname, '..', 'output', 'training_dataset.jsonl');
fs.mkdirSync(path.dirname(DATASET_FILE), { recursive: true });

async function _appendTrainingExample({ patient_id, query, response }) {
  const example = {
    patient_id,
    query,
    response,
    addedAt: new Date().toISOString(),
  };
  fs.appendFileSync(DATASET_FILE, JSON.stringify(example) + '\n');
  return example;
}

const addTrainingExample = withPurposeCheck(_appendTrainingExample, {
  purpose: 'model_training',
  registry: RESTRICTABLE_PURPOSES_SET,
  layer: 'training_pipeline',
});

module.exports = { addTrainingExample };
