import { readdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join, relative } from 'path';

const ROOT = process.cwd();
const EXCLUDE_DIRS = new Set(['node_modules', '.next', '.git', 'public/icons']);
const INCLUDE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.mjs', '.cjs', '.env']);

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const rel = relative(ROOT, p);
    if (EXCLUDE_DIRS.has(name)) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, files);
    else {
      const dot = name.lastIndexOf('.');
      const ext = dot >= 0 ? name.slice(dot) : '';
      if (INCLUDE_EXT.has(ext) || rel.endsWith('env.local')) files.push(rel);
    }
  }
  return files;
}

const files = walk(ROOT);
const chunks = files.map(f => {
  const content = readFileSync(join(ROOT, f), 'utf8');
  return `\n===== FILE: ${f} =====\n\n\`\`\`\n${content}\n\`\`\``;
});

writeFileSync('snapshot.txt', chunks.join('\n'), 'utf8');
console.log(`snapshot.txt written with ${files.length} files`);