import {readFileSync} from 'node:fs';
const [tab, file] = process.argv.slice(2);
process.argv = [process.argv[0], process.argv[1], 'eval', tab, readFileSync(file, 'utf8')];
await import('./browser-read.mjs');
