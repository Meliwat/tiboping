import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const allowed = new Set([
  '0BSD',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC-BY-4.0',
  'CC0-1.0',
  'ISC',
  'MIT',
  'MIT-0',
  'MPL-2.0',
  'OFL-1.1',
  'Python-2.0',
  'Unlicense',
]);

const manifestAt = (directory) => {
  const filename = path.join(directory, 'package.json');
  return JSON.parse(readFileSync(filename, 'utf8'));
};

const licenseText = (manifest) => {
  if (typeof manifest.license === 'string') return manifest.license.trim();
  if (manifest.license && typeof manifest.license.type === 'string') {
    return manifest.license.type.trim();
  }
  if (Array.isArray(manifest.licenses)) {
    return manifest.licenses
      .map((item) => (typeof item === 'string' ? item : item?.type))
      .filter((item) => typeof item === 'string')
      .join(' OR ');
  }
  return '';
};

const stripOuterParentheses = (value) => {
  let result = value.trim();
  while (result.startsWith('(') && result.endsWith(')')) {
    result = result.slice(1, -1).trim();
  }
  return result;
};

const expressionAllowed = (input) => {
  const expression = stripOuterParentheses(input);
  if (allowed.has(expression)) return true;
  if (expression.includes(' OR ')) {
    return expression.split(' OR ').some(expressionAllowed);
  }
  if (expression.includes(' AND ')) {
    return expression.split(' AND ').every(expressionAllowed);
  }
  const [base, exception, ...extra] = expression.split(' WITH ');
  return (
    extra.length === 0 &&
    exception === 'LLVM-exception' &&
    base !== undefined &&
    expressionAllowed(base)
  );
};

const packages = [];
const visitNodeModules = (nodeModules) => {
  if (!existsSync(nodeModules)) return;
  for (const entry of readdirSync(nodeModules, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    if (entry.name.startsWith('@')) {
      for (const scoped of readdirSync(path.join(nodeModules, entry.name), {
        withFileTypes: true,
      })) {
        if (scoped.isDirectory()) {
          visitPackage(path.join(nodeModules, entry.name, scoped.name));
        }
      }
    } else {
      visitPackage(path.join(nodeModules, entry.name));
    }
  }
};

const visitPackage = (directory) => {
  const manifestPath = path.join(directory, 'package.json');
  if (!existsSync(manifestPath)) return;
  const manifest = manifestAt(directory);
  packages.push({
    name: `${manifest.name ?? path.basename(directory)}@${manifest.version ?? '?'}`,
    license: licenseText(manifest),
  });
  visitNodeModules(path.join(directory, 'node_modules'));
};

const rootManifest = manifestAt(root);
if (rootManifest.license !== 'MIT' || !existsSync(path.join(root, 'LICENSE'))) {
  throw new Error('The root package and LICENSE file must declare the MIT license');
}

visitNodeModules(path.join(root, 'node_modules'));
const failures = packages.filter(
  ({ license }) => !license || !expressionAllowed(license),
);
if (failures.length > 0) {
  process.stderr.write(
    `Disallowed or unknown dependency licenses:\n${failures
      .map(({ name, license }) => `- ${name}: ${license || '(missing)'}`)
      .join('\n')}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(`Checked ${packages.length} dependency licenses.\n`);
}
