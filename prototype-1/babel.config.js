// Needed only so Jest can load @a2a-js/sdk's transitive dependency `jose`,
// which ships ESM-only. Node's native require() handles ESM interop on its
// own (Jest's CommonJS module system does not), so this transform is
// scoped to node_modules/jose via jest's transformIgnorePatterns below.
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
};
