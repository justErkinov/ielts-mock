// Listening parts are stored as separate tests titled "<Test name>, Part N".
// These helpers present them as one 4-part test.

export function splitTitle(title = '') {
  const m = title.match(/^(.*?)[\s,–—-]*Part\s*(\d+)\s*$/i);
  return m ? { base: m[1].trim(), part: Number(m[2]) } : { base: title.trim(), part: 1 };
}

export function groupTests(tests = []) {
  const map = new Map();
  tests.forEach(t => {
    const { base, part } = splitTitle(t.title);
    if (!map.has(base)) map.set(base, []);
    map.get(base).push({ ...t, part });
  });
  return [...map.entries()].map(([base, parts]) => ({
    base,
    parts: parts.sort((a, b) => a.part - b.part),
  }));
}
