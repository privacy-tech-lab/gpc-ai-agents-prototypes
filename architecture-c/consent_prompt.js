'use strict';

const readline = require('readline');
const bus = require('./event_bus');
const manifest = require('./consent_manifest');

function buildPromptText(tool) {
  return [
    `Tool:        ${tool.name}`,
    `Category:    ${tool.capability_category}`,
    `Added in:    ${tool.added_at}`,
    `Description: ${tool.description}`,
    ``,
    `This tool was added after your last consent update (manifest version: v1.0).`,
    `Approving persists this choice for all future sessions.`,
    `Declining blocks this tool permanently until you change it in settings.`,
  ].join('\n');
}

function register(mode) {
  bus.on('consent_request', ({ tool, resolve }) => {
    const promptText = buildPromptText(tool);

    if (mode === 'approve') {
      console.log(`\n[CONSENT REQUEST — auto-approve]\n${promptText}\n`);
      manifest.approve(tool.capability_category);
      resolve({ approved: true, promptText });
      return;
    }

    if (mode === 'decline') {
      console.log(`\n[CONSENT REQUEST — auto-decline]\n${promptText}\n`);
      manifest.decline(tool.capability_category);
      resolve({ approved: false, promptText });
      return;
    }

    // Interactive
    console.log(`\n[CONSENT REQUEST]\n${promptText}\n`);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Approve this tool? (y/n): ', (answer) => {
      rl.close();
      const approved = answer.trim().toLowerCase() === 'y';
      if (approved) {
        manifest.approve(tool.capability_category);
      } else {
        manifest.decline(tool.capability_category);
      }
      resolve({ approved, promptText });
    });
  });
}

module.exports = { register, buildPromptText };
