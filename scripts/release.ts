import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const notes = process.argv[2];
if (!notes) {
  console.error('Usage: npm run release -- "your release notes here"');
  process.exit(1);
}

const root = path.join(__dirname, '..');

// Check for uncommitted changes
const status = execSync('git status --porcelain', { cwd: root, encoding: 'utf-8' }).trim();
if (status) {
  console.error('Error: uncommitted changes. Commit or stash them before releasing.');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf-8'));
let version = pkg.version;
let tag = `v${version}`;

// Check if current version already has a tag — if so, bump
let tagExists = false;
try {
  execSync(`git rev-parse ${tag}`, { cwd: root, stdio: 'ignore' });
  tagExists = true;
} catch {}

if (tagExists) {
  console.log(`Tag ${tag} already exists, bumping patch version...`);
  execSync('npm version patch', { stdio: 'inherit', cwd: root });
  const updated = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf-8'));
  version = updated.version;
  tag = `v${version}`;
}

const exe = path.join(root, 'out', 'make', 'squirrel.windows', 'x64', `Athena-${version} Setup.exe`);

console.log(`Building ${tag}...`);
execSync('npm run make', { stdio: 'inherit', cwd: root });

console.log('Pushing commit and tag...');
execSync('git push && git push --tags', { stdio: 'inherit', cwd: root });

console.log(`Creating GitHub release ${tag}...`);
execSync(`gh release create ${tag} "${exe}" --title "${tag}" --notes "${notes}"`, {
  stdio: 'inherit',
  cwd: root,
});

console.log(`Released ${tag}`);
