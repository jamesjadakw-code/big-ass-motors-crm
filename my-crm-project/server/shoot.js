// Screenshot helper: drives headless Edge over the DevTools protocol (built-in WebSocket, no dependencies).
// Usage: node shoot.js <url> <outDir> <scenario>   scenarios: bulk
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const [url, outDir, scenario] = process.argv.slice(2);
const edge = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(fs.existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bam-shot-'));
  const proc = spawn(edge, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=9333', `--user-data-dir=${profile}`, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 40 && !targets; i++) { await sleep(300); try { targets = await (await fetch('http://127.0.0.1:9333/json')).json(); } catch { /* not up yet */ } }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const waiting = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); } };
  const cdp = (method, params = {}) => new Promise((res) => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const run = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.result.value;
  const shot = async (name) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(outDir, name), Buffer.from(r.result.data, 'base64')); console.log('saved', name); };

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url });
  await sleep(4000); // fonts + data

  if (scenario === 'bulk') {
    await run(`window.open = () => null; [...document.querySelectorAll('main button')].find(b => b.innerText.includes('Tick top 5'))?.click()`);
    await sleep(600);
    await run(`document.querySelector('main h2')?.scrollIntoView(); document.querySelector('section.overflow-y-auto')?.scrollTo(0, 130)`);
    await sleep(400);
    await shot('v4-bulk-select.png');
    await run(`[...document.querySelectorAll('main button.btn-primary')].find(b => /draft/i.test(b.innerText))?.click()`);
    await sleep(10000);
    await shot('v4-bulk-result.png');
  }
  ws.close(); proc.kill();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
