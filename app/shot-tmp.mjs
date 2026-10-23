import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const p = await b.newPage({ viewport: { width: 1024, height: 1024 } });
for (const f of process.argv.slice(2)) { await p.goto('file://' + f); await p.screenshot({ path: f.replace('.svg', '.png') }); }
await b.close();
