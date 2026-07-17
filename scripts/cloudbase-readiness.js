'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'cloudbase/schema.json'), 'utf8'));
const cli = process.env.WECHAT_DEVTOOLS_CLI || '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
const envId = (process.env.MYALLY_CLOUDBASE_ENV_ID || '').trim();
const deploy = process.argv.includes('--deploy');

function fail(message) {
  console.error(`cloudbase readiness failed: ${message}`);
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) fail(`${path.basename(command)} exited with ${result.status}`);
}

if (!fs.existsSync(cli)) fail('WeChat developer tools CLI is unavailable');
for (const name of manifest.cloudFunctions) {
  for (const file of ['index.js', 'package.json']) {
    if (!fs.existsSync(path.join(root, 'cloudfunctions', name, file))) fail(`${name}/${file} is missing`);
  }
}

const summary = {
  schemaVersion: manifest.version,
  collections: manifest.collections.map((item) => item.name),
  cloudFunctions: manifest.cloudFunctions,
  developerToolsCli: true,
  cloudbaseEnvironmentConfigured: Boolean(envId),
  next: envId
    ? (deploy ? 'deploy' : 'run npm run cloud:deploy to deploy both functions')
    : 'open CloudBase for the formal AppID, then export MYALLY_CLOUDBASE_ENV_ID locally',
};
console.log(JSON.stringify(summary, null, 2));

if (!deploy) process.exit(0);
if (!envId) fail('MYALLY_CLOUDBASE_ENV_ID is required and must not be committed');
if (!/^[a-zA-Z0-9_-]{6,128}$/.test(envId)) fail('MYALLY_CLOUDBASE_ENV_ID has an invalid format');

run(process.execPath, ['scripts/validate-project.js']);
run(cli, ['cloud', 'functions', 'list', '--env', envId, '--project', root, '--lang', 'zh']);
run(cli, [
  'cloud', 'functions', 'deploy', '--env', envId,
  '--names', ...manifest.cloudFunctions,
  '--remote-npm-install', '--project', root, '--lang', 'zh',
]);
run(cli, ['cloud', 'functions', 'list', '--env', envId, '--project', root, '--lang', 'zh']);

console.log('Cloud functions deployed. Create and verify collections/indexes from cloudbase/schema.json before end-to-end testing.');
