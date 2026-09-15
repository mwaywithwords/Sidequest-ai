import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:3000";
const OUT = "/Users/samsonadeyemi/sidequest-ai/.tmp-theme-review/";
const PORT = 9337;

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
    "--user-data-dir=/tmp/sq-student-exp-review",
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
  width: 375,
  height: 812,
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
  await sleep(350);
  await page.eval(`document.querySelectorAll("nextjs-portal").forEach((el) => el.remove())`);
}

async function shot(name) {
  await page.eval(`document.querySelectorAll("nextjs-portal").forEach((el) => el.remove())`);
  const result = await page.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await writeFile(`${OUT}${name}.png`, Buffer.from(result.data, "base64"));
  console.log("wrote", name);
}

await load("/scan?grade=4&skill=addition", "light");
const layout = await page.eval(`
  (() => {
    const hunt = document.querySelector(".hunt-ideas");
    const camera = document.querySelector(".scan-frame");
    const take = [...document.querySelectorAll("button")].find((el) =>
      (el.textContent || "").includes("Take a Photo"),
    );
    const cameraBox = camera?.getBoundingClientRect();
    const takeBox = take?.getBoundingClientRect();
    return {
      huntText: hunt?.innerText || "",
      cameraVisible: Boolean(camera),
      cameraHeight: cameraBox ? Math.round(cameraBox.height) : 0,
      takePhotoY: takeBox ? Math.round(takeBox.top) : null,
      viewport: window.innerHeight,
      takePhotoBelowFold: takeBox ? takeBox.top > window.innerHeight - 8 : null,
    };
  })()
`);
console.log("layout", JSON.stringify(layout, null, 2));
await shot("hunt-375-light");

await page.eval(`document.querySelector(".hunt-surprise")?.click()`);
await sleep(200);
const surprise = await page.eval(`document.querySelector(".hunt-surprise")?.innerText || ""`);
console.log("surprise", surprise);
await shot("hunt-375-light-surprise");

await load("/scan?grade=4&skill=addition", "dark");
await shot("hunt-375-dark");

await load("/quest/071b3e23-a080-4312-be99-b644f9c90d6a", "light");
const discover = await page.eval(`document.body.innerText.slice(0, 1200)`);
console.log("discover", discover);
await shot("discover-375-light");

browser.ws.close();
chrome.kill("SIGKILL");
console.log("done");
