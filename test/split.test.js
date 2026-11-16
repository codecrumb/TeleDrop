import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';

// splitFile + rejoinMessage live in the single-file frontend; extract and eval
// them so the tests run against the real shipped code.
const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
const start = html.indexOf('const ZIP_SIZE_LIMIT');
const end = html.indexOf('// ── Auth');
assert.ok(start !== -1 && end > start, 'could not find splitFile in index.html');
// Shrink the part size so tests stay small; the shipped value is 45 MB.
const source = html.slice(start, end).replace('PART_SIZE = 45 * 1024 * 1024', 'PART_SIZE = 10');
const { splitFile } = new Function('File', `${source}; return { splitFile };`)(File);

function fileOfSize(bytes, name = 'big.bin') {
  const data = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) data[i] = (i * 7 + 3) & 0xff; // deterministic pseudo-binary
  return new File([data], name, { type: 'application/octet-stream' });
}

describe('large files: splitFile', function () {
  it('splits at the binary level; the parts concatenate back to the original bytes', async function () {
    const file = fileOfSize(25); // 3 parts: 10, 10, 5
    const parts = splitFile(file);
    assert.strictEqual(parts.length, 3);

    const joined = new Uint8Array(25);
    let at = 0;
    for (const part of parts) {
      joined.set(new Uint8Array(await part.arrayBuffer()), at);
      at += part.size;
    }
    const original = new Uint8Array(await file.arrayBuffer());
    assert.deepStrictEqual(joined, original);
  });

  it('names parts name.part1, name.part2, … with no padding under 10 parts', function () {
    const parts = splitFile(fileOfSize(25), 'video.mp4');
    assert.deepStrictEqual(parts.map(p => p.name), ['big.bin.part1', 'big.bin.part2', 'big.bin.part3']);
  });

  it('zero-pads part numbers from 10 parts up, so `cat name.part*` globs in order', function () {
    const parts = splitFile(fileOfSize(100)); // 10 parts of 10
    const names = parts.map(p => p.name);
    assert.deepStrictEqual(names, Array.from({ length: 10 }, (_, i) => `big.bin.part${String(i + 1).padStart(2, '0')}`));
    assert.deepStrictEqual([...names].sort(), names, 'lexicographic glob order must match part order');
  });

  it('returns a single part for a file that fits', function () {
    const parts = splitFile(fileOfSize(10));
    assert.strictEqual(parts.length, 1);
    assert.strictEqual(parts[0].name, 'big.bin.part1');
  });
});

