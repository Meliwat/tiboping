import { cpSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const source = path.join(repositoryRoot, 'apps/server/src/db/migrations');
const destination = path.join(repositoryRoot, 'apps/server/dist/db/migrations');

mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true });
