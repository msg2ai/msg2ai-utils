#!/usr/bin/env node
// Calls run() explicitly: requiring the core module is not enough, because its
// own entry guard is `require.main === module` and require.main here is THIS
// file. process.argv[1] stays this file's path, which is what selects the
// vertical — see skin.ts detectSkin().
const { run } = require('@msg2ai/ai-ambassador-toolkit/dist/cli.js');
run().then((code) => process.exit(code));
