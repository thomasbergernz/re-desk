#!/usr/bin/env node
// Builds the Custom UI, deploys to the Forge production environment, and
// surfaces the app version Forge assigned — changelog versions follow the
// production app version (see the CHANGELOG.md header), and the full
// x.y.z only appears in the deploy command's output.
const { spawnSync } = require('node:child_process');

function run(cmd, args) {
  const res = spawnSync(cmd, args, {
    stdio: ['inherit', 'pipe', 'inherit'],
    encoding: 'utf8',
  });
  process.stdout.write(res.stdout || '');
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
  return res.stdout || '';
}

run('npm', ['run', 'build:queue']);
const out = run('forge', ['deploy', '--non-interactive', '-e', 'production']);

const match = out.match(
  /\[(\d+\.\d+\.\d+)\] that was just deployed to \[production\]/
);
if (match) {
  const version = match[1];
  const date = new Date().toISOString().slice(0, 10);
  console.log(`\nDeployed production version: ${version}`);
  console.log(`Changelog heading for this release: ## [${version}] - ${date}`);
  console.log(`Sync package.json: npm version ${version} --no-git-tag-version`);
} else {
  console.warn(
    '\nCould not find the app version in the deploy output — check above.'
  );
}
