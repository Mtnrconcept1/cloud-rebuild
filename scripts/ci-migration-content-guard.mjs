import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
export function findContentDuplicates(files, baseline) {
  const groups = new Map();
  for (const file of files) {
    const hash = createHash('sha256').update(file.sql.trim()).digest('hex');
    if (!groups.has(hash)) groups.set(hash, []);
    groups.get(hash).push(file.path);
  }
  return [...groups].filter(([sha256, paths]) => paths.length > 1 && !baseline.some(entry =>
    entry.sha256 === sha256 && entry.paths.length === paths.length && paths.every(p => entry.paths.includes(p))
  )).map(([sha256, paths]) => ({ sha256, paths: paths.sort() }));
}
export function main(root = process.cwd()) {
  const directory = path.join(root, 'supabase/migrations');
  const files = readdirSync(directory).filter(p => p.endsWith('.sql')).map(p => ({ path: p, sql: readFileSync(path.join(directory, p), 'utf8') }));
  const baseline = JSON.parse(readFileSync(path.join(root, 'scripts/migration-content-baseline.json'), 'utf8'));
  const duplicates = findContentDuplicates(files, baseline);
  if (duplicates.length) throw new Error(`Unreviewed duplicate migration content: ${JSON.stringify(duplicates)}`);
  console.log(`${files.length} migrations checked; no unreviewed content duplicates.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
