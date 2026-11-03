const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('launcher avoids a server with missing scripts and prefers a compatible default server', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'betr-launcher-'));
  function script(name, text) { fs.writeFileSync(path.join(dir, name), '#!/bin/bash\n' + text, { mode: 0o755 }); }
  try {
    script('curl', `for value in "$@"; do
  case "$value" in
    http://127.0.0.1:47615/ping|http://127.0.0.1:47616/ping) echo 'Bet-R Play-R'; exit 0;;
    http://127.0.0.1:47615/js/*) [ "$LAUNCHER_TEST_COMPATIBLE" = 1 ]; exit $?;;
    http://127.0.0.1:47616/js/*) exit 0;;
  esac
done
exit 22`);
    script('chromium', 'printf "%s\\n" "$@"');
    script('node', 'exit 70'); script('setsid', 'exit 71');
    for (const compatible of ['0', '1']) {
      const result = spawnSync('bash', [path.resolve(__dirname, '../run.sh')], {
        env: { ...process.env, PATH: dir + path.delimiter + process.env.PATH, LAUNCHER_TEST_COMPATIBLE: compatible }, encoding: 'utf8', timeout: 5000,
      });
      assert.equal(result.status, 0, result.stderr);
      assert.ok(result.stdout.includes('--app=http://127.0.0.1:' + (compatible === '1' ? '47615' : '47616') + '/'));
      assert.ok(!result.stdout.includes('--use-fake-ui-for-media-stream'));
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
