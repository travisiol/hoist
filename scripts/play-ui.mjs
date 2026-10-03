/**
 * Local only: drives the built site in headless Chrome as a connected wallet
 * against the hardhat node (8901), whose test accounts are unlocked, so
 * eth_sendTransaction goes straight to the node. Plays: connect, launch a token, buy, stake, claim. Screenshots into shots/ui-*.png.
 *
 *   node scripts/play-ui.mjs [base=http://localhost:3901] [account] [tokenLabel=01]
 *
 * The injected provider is a test stub announced over EIP-6963; it never
 * holds a key and only talks to http://127.0.0.1:8901.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const base = process.argv[2] ?? "http://localhost:3901";
const account = process.argv[3] ?? "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955";
const lift = process.argv[4];
const out = resolve("shots");
mkdirSync(out, { recursive: true });
const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find((p) => existsSync(p));
const PORT = 9348;
const proc = spawn(chrome, ["--headless=new", "--no-first-run", `--user-data-dir=${resolve(".capture-profile-ui")}`, `--remote-debugging-port=${PORT}`, "--window-size=1536,900", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STUB = `(() => {
  const account = ${JSON.stringify(account)};
  const rpc = async (method, params) => {
    const r = await fetch("http://127.0.0.1:8901", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? [] }) });
    const j = await r.json();
    if (j.error) { const e = new Error(j.error.message); e.code = j.error.code; e.data = j.error.data; throw e; }
    return j.result;
  };
  const listeners = {};
  const provider = {
    isMetaMask: false,
    request: async ({ method, params }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [account];
      if (method === "eth_chainId") return "0x7a69";
      if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
      if (method === "wallet_requestPermissions" || method === "wallet_getPermissions") return [{ parentCapability: "eth_accounts" }];
      if (method === "eth_sendTransaction") { const tx = { ...params[0], from: account }; return rpc(method, [tx]); }
      return rpc(method, params);
    },
    on: (ev, fn) => { (listeners[ev] ||= []).push(fn); },
    removeListener: (ev, fn) => { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); },
  };
  const info = { uuid: "7d0c7c39-0000-4000-8000-000000000001", name: "Local test wallet", icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'%3E%3Crect width='8' height='8' fill='%23162018'/%3E%3C/svg%3E", rdns: "local.test.wallet" };
  const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
  window.addEventListener("eip6963:requestProvider", announce);
  window.ethereum = provider;
  announce();
})();`;

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener("message", (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) rej(new Error(m.error.message));
        else res(m.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
}

async function main() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break;
    } catch {}
    await sleep(200);
  }
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  const cdp = new Cdp(ws);
  const js = async (expression) => (await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
  const shot = async (name) => {
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    writeFileSync(resolve(out, `${name}.png`), Buffer.from(data, "base64"));
    console.log(`${name}.png`);
  };
  const clickText = (text) => js(`(() => { const b = [...document.querySelectorAll("button,a")].filter((x) => x.textContent.trim().startsWith(${JSON.stringify(text)}) && !x.disabled).pop(); if (b) b.click(); return b ? b.textContent.trim() : false; })()`);
  const type = (selector, value) => js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
  const text = (re) => js(`document.body.innerText.match(${re})?.[0] ?? null`);

  await cdp.send("Page.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1536, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: STUB });

  // 1. connect + launch
  await cdp.send("Page.navigate", { url: base + "/launch" });
  await sleep(6000);
  console.log("connect:", await clickText("Connect wallet"));
  await sleep(3000);
  console.log("typed:", await type('input[placeholder="Name"]', "UI Hoisted"), await type('input[placeholder="TICKER"]', "UIH"));
  await sleep(300);
  console.log("tax 3%:", await clickText("3%"));
  console.log("launch:", await clickText("Launch"));
  await sleep(8000);
  console.log("result:", await text("/\$UIH is live\.|Launching[^\n]*|[^\n]*(error|revert|unavailable)[^\n]*/i"));
  await shot("ui-launched-1536");

  // 2. trade + stake + claim on the token seeded by play-local
  await cdp.send("Page.navigate", { url: `${base}/${lift}` });
  await sleep(8000);
  console.log("buy preset:", await clickText("0.05 ETH"));
  await sleep(1500);
  console.log("buy:", await clickText("Buy LIFT"));
  await sleep(6000);
  console.log("after buy:", await text("/Confirmed[^\n]*|reverted[^\n]*/"));
  await sleep(9000);
  console.log("max:", await js(`(() => { const b = [...document.querySelectorAll("#stake button")].find((x) => x.textContent.includes("in wallet")); if (b) b.click(); return b?.textContent; })()`));
  await sleep(800);
  console.log("approve:", await clickText("Approve LIFT"));
  await sleep(6000);
  console.log("stake:", await clickText("Stake LIFT"));
  await sleep(7000);
  console.log("stake panel:", await js(`document.querySelector("#stake")?.innerText`));
  // more fees arrive: buy again
  console.log("buy2 preset:", await clickText("0.5 ETH"));
  await sleep(1500);
  console.log("buy2:", await clickText("Buy LIFT"));
  await sleep(7000);
  await sleep(9000);
  console.log("before claim:", await js(`document.querySelector("#stake")?.innerText`));
  console.log("claim:", await clickText("Claim "));
  await sleep(8000);
  console.log("after claim:", await js(`document.querySelector("#stake")?.innerText`));
  console.log("cards:", await text("/All-time paid to holders[\s\S]{0,140}/"));
  await shot("ui-claimed-1536");
  ws.close();
}

try {
  await main();
} finally {
  proc.kill();
}
