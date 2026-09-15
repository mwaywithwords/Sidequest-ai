import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:3000";
const OUT = "/Users/samsonadeyemi/sidequest-ai/.tmp-theme-review/";
const PORT = 9334;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForPort(port, timeout = 8000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = createConnection({ port, host: "127.0.0.1" }, () => {
        socket.end();
        resolve();
      });
      socket.on("error", () => {
        if (Date.now() - start > timeout) reject(new Error("port timeout"));
        else setTimeout(tryConnect, 120);
      });
    };
    tryConnect();
  });
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
      }
      if (message.method && this.listeners.has(message.method)) {
        for (const fn of this.listeners.get(message.method)) fn(message.params);
      }
    });
  }

  once(method) {
    return new Promise((resolve) => {
      const fn = (params) => {
        const list = this.listeners.get(method) || [];
        this.listeners.set(method, list.filter((l) => l !== fn));
        resolve(params);
      };
      const list = this.listeners.get(method) || [];
      list.push(fn);
      this.listeners.set(method, list);
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || "eval failed");
    }
    return result.result?.value;
  }
}

await mkdir(OUT, { recursive: true });
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`,
    "--user-data-dir=/tmp/sq-theme-review-profile",
    "--no-first-run",
  ],
  { stdio: "ignore" },
);
process.on("exit", () => chrome.kill("SIGKILL"));

await waitForPort(PORT);
const version = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json());
const browser = new Cdp(new WebSocket(version.webSocketDebuggerUrl));
await new Promise((resolve, reject) => {
  browser.ws.addEventListener("open", resolve);
  browser.ws.addEventListener("error", reject);
});

const created = await browser.send("Target.createTarget", { url: "about:blank" });
const info = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
const target = info.find((item) => item.id === created.targetId);
const page = new Cdp(new WebSocket(target.webSocketDebuggerUrl));
await new Promise((resolve, reject) => {
  page.ws.addEventListener("open", resolve);
  page.ws.addEventListener("error", reject);
});
await page.send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
});
await page.send("Page.enable");
await page.send("Runtime.enable");

async function load(path, theme) {
  const loaded = page.once("Page.loadEventFired");
  await page.send("Page.navigate", { url: `${BASE}${path}` });
  await loaded;
  await page.eval(`localStorage.setItem("sidequest.theme", "${theme}")`);
  const reloaded = page.once("Page.loadEventFired");
  await page.send("Page.reload");
  await reloaded;
  await sleep(280);
  await page.eval(`document.querySelectorAll("nextjs-portal").forEach((el) => el.remove())`);
}

async function shot(name) {
  await page.eval(`document.querySelectorAll("nextjs-portal").forEach((el) => el.remove())`);
  const result = await page.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await writeFile(`${OUT}${name}.png`, Buffer.from(result.data, "base64"));
  console.log("wrote", name);
}

for (const theme of ["light", "dark"]) {
  await load("/", theme);
  await shot(`theme-landing-390-${theme}`);
  await load("/setup", theme);
  await page.eval(`document.querySelectorAll(".setup-stage .mission-tile, fieldset .mission-tile, button[aria-pressed]").length`);
  const clicked = await page.eval(`
    (() => {
      const tiles = [...document.querySelectorAll("button[aria-pressed]")];
      const grade = tiles.find((el) => (el.textContent || "").includes("4") || (el.textContent || "").includes("Grade 4"));
      if (grade) grade.click();
      return Boolean(grade);
    })()
  `);
  if (clicked) await sleep(250);
  await shot(`theme-setup-390-${theme}`);
  await load("/progress", theme);
  await shot(`theme-progress-390-${theme}`);
}

browser.ws.close();
chrome.kill("SIGKILL");
console.log("done");
