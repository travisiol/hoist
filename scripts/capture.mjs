/**
 * Screenshots of the running site with headless Chrome over the DevTools
 * protocol (Node's built-in WebSocket, no dependency):
 *
 *   node scripts/capture.mjs [base=http://localhost:3901] [outDir=shots]
 *   ONLY=home-1536,launch-390 node scripts/capture.mjs      # a subset
 *   SUFFIX=-live node scripts/capture.mjs                   # other file names
 *
 * Device metrics are emulated per shot (a 390 px phone needs it: a headless
 * window cannot be that narrow), and each shot waits a few real seconds for
 * fonts, hydration and the price route. Use localhost, not 127.0.0.1: the
 * dev server refuses its scripts to another origin.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const base = process.argv[2] ?? "http://localhost:3901";
const out = resolve(process.argv[3] ?? "shots");
mkdirSync(out, { recursive: true });
const only = process.env.ONLY?.split(",");
const suffix = process.env.SUFFIX ?? "";
const app = process.env.APP_PATH ?? "/launch";

const CANDIDATES = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"];
const chrome = CANDIDATES.find((p) => existsSync(p));
if (!chrome) throw new Error("no Chrome found");

const shots = [
  { name: "home-1536-fold", path: "/", w: 1536, h: 864 },
  { name: "home-1536", path: "/", w: 1536, h: 864, full: true },
  { name: "launch-1536", path: app, w: 1536, h: 864, full: true },
  { name: "home-390-fold", path: "/", w: 390, h: 844, mobile: true },
  { name: "home-390", path: "/", w: 390, h: 844, mobile: true, full: true },
  { name: "launch-390", path: app, w: 390, h: 844, mobile: true, full: true },
  // the launch button with every field filled: shows its inline message
  { name: "launch-click-1536", path: app, w: 1536, h: 864, act: "fill", full: true },
  { name: "docs-1536", path: "/docs", w: 1536, h: 864, full: true },
  { name: "vault-1536", path: "/vault", w: 1536, h: 864, full: true },
  { name: "portfolio-1536", path: "/portfolio", w: 1536, h: 864, full: true },
  // a launched token (set TOKEN to its address)
  ...(process.env.TOKEN ? [
    { name: "token-1536", path: `/${process.env.TOKEN}`, w: 1536, h: 864, full: true },
    { name: "token-390", path: `/${process.env.TOKEN}`, w: 390, h: 844, mobile: true, full: true },
  ] : []),
  { name: "token-unknown-390", path: "/0x0000000000000000000000000000000000000001", w: 390, h: 844, mobile: true },
].filter((s) => !only || only.includes(s.name));

const PORT = 9353;
const proc = spawn(
  chrome,
  [
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${resolve(tmpdir(), "hoist-capture")}`,
    `--remote-debugging-port=${PORT}`,
    "--hide-scrollbars",
    "--window-size=1536,864",
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForChrome() {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  throw new Error("chrome did not start");
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
}

async function connect() {
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res);
    ws.addEventListener("error", rej);
  });
  return { cdp: new Cdp(ws), ws, targetId: target.id };
}

try {
  await waitForChrome();
  for (const s of shots) {
    const { cdp, ws, targetId } = await connect();
    await cdp.send("Page.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: s.w, height: s.h, deviceScaleFactor: 1, mobile: Boolean(s.mobile) });
    await cdp.send("Page.navigate", { url: base + s.path });
    await sleep(Number(process.env.WAIT ?? 7000));
    if (s.act === "fill") {
      await cdp.send("Runtime.evaluate", {
        expression: `(() => {
          const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
          const vals = ["Lift", "LIFT", "", ""];
          document.querySelectorAll("form input").forEach((el, i) => { set.call(el, vals[i] ?? ""); el.dispatchEvent(new Event("input", { bubbles: true })); });
          [...document.querySelectorAll("form button[type=submit]")][0].click();
        })()`,
      });
      await sleep(1500);
    }
    // the page's own measure of horizontal overflow, printed next to the file name
    const { result } = await cdp.send("Runtime.evaluate", {
      expression: "JSON.stringify({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth })",
      returnByValue: true,
    });
    let clip;
    if (s.full) {
      const { contentSize } = await cdp.send("Page.getLayoutMetrics");
      const height = Math.min(Math.ceil(contentSize.height), 12000);
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: s.w, height, deviceScaleFactor: 1, mobile: Boolean(s.mobile) });
      await sleep(1500);
      clip = { x: 0, y: 0, width: s.w, height, scale: 1 };
    }
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: Boolean(s.full), ...(clip ? { clip } : {}) });
    writeFileSync(resolve(out, `${s.name}${suffix}.png`), Buffer.from(data, "base64"));
    console.log(`${s.name}${suffix}.png ${result.value}`);
    ws.close();
    await fetch(`http://127.0.0.1:${PORT}/json/close/${targetId}`).catch(() => {});
  }
} finally {
  proc.kill();
}
