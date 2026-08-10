'use strict';

const readline = require('readline');
const bus = require('./event_bus');
const manifest = require('./presence_manifest');

function buildPromptText(feature) {
  return [
    `Feature:     ${feature.name}`,
    `Invocation:  ${feature.invocation}`,
    `Added in:    ${feature.added_in}`,
    `Description: ${feature.description}`,
    ``,
    `This AI feature arrived in an update and is off by default (A1).`,
    `Approving turns it on and persists that choice for future sessions.`,
    `Declining keeps it off until you change it in settings.`,
  ].join('\n');
}

function register(mode) {
  bus.on('opt_in_request', ({ feature, resolve }) => {
    const promptText = buildPromptText(feature);

    if (mode === 'approve') {
      console.log(`\n[OPT-IN REQUEST: auto-approve]\n${promptText}\n`);
      manifest.enable(feature.name);
      resolve({ approved: true, promptText });
      return;
    }

    if (mode === 'decline') {
      console.log(`\n[OPT-IN REQUEST: auto-decline]\n${promptText}\n`);
      manifest.decline(feature.name);
      resolve({ approved: false, promptText });
      return;
    }

    // Interactive
    console.log(`\n[OPT-IN REQUEST]\n${promptText}\n`);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Turn this AI feature on? (y/n): ', answer => {
      rl.close();
      const approved = answer.trim().toLowerCase() === 'y';
      if (approved) {
        manifest.enable(feature.name);
      } else {
        manifest.decline(feature.name);
      }
      resolve({ approved, promptText });
    });
  });
}

module.exports = { register, buildPromptText };
