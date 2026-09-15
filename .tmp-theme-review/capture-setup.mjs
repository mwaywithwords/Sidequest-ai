import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";

const CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:3000";
const OUT = new URL(".", import.meta.url).pathname;
const PORT = 9333;

const viewports = [
  { name: "375", width: 375, height: 812 },
  { name: "390", width: 390, height: 844 },
  { name: "430", width: 430, height: 932 },
  { name: "ipad", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
];

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
        if (Date.now() - start > timeout) {
          reject(new Error(`Chrome debug port ${port} did not open`));
          return;
        }
        setTimeout(tryConnect, 120);
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
        this.listeners.set(
          method,
          list.filter((listener) => listener !== fn),
        );
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
    `--user-data-dir=/tmp/sq-setup-review-profile`,
    "--no-first-run",
    "--no-default-browser-check",
  ],
  { stdio: "ignore" },
);

process.on("exit", () => chrome.kill("SIGKILL"));
process.on("SIGINT", () => {
  chrome.kill("SIGKILL");
  process.exit(1);
});

await waitForPort(PORT);
const version = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) =>
  r.json(),
);
const browser = new Cdp(new WebSocket(version.webSocketDebuggerUrl));
await new Promise((resolve, reject) => {
  browser.ws.addEventListener("open", resolve);
  browser.ws.addEventListener("error", reject);
});

async function openPage(width, height) {
  const created = await browser.send("Target.createTarget", {
    url: "about:blank",
  });
  const info = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) =>
    r.json(),
  );
  const target = info.find((item) => item.id === created.targetId);
  const page = new Cdp(new WebSocket(target.webSocketDebuggerUrl));
  await new Promise((resolve, reject) => {
    page.ws.addEventListener("open", resolve);
    page.ws.addEventListener("error", reject);
  });
  await page.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: width < 768,
  });
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  return { page, targetId: created.targetId };
}

async function shot(page, name) {
  await page.eval(`
    document.querySelectorAll("nextjs-portal").forEach((el) => el.remove());
  `);
  const result = await page.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  await writeFile(`${OUT}${name}.png`, Buffer.from(result.data, "base64"));
  console.log("wrote", name);
}

async function loadSetup(page, theme) {
  const loaded = page.once("Page.loadEventFired");
  await page.send("Page.navigate", { url: `${BASE}/setup` });
  await loaded;
  await page.eval(`localStorage.setItem("sidequest.theme", "${theme}")`);
  const reloaded = page.once("Page.loadEventFired");
  await page.send("Page.reload");
  await reloaded;
  await sleep(250);
  await page.eval(`
    new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        if (document.querySelector(".setup-stage") && document.querySelector(".mission-tile")) {
          resolve(true);
          return;
        }
        if (Date.now() - start > 5000) resolve(false);
        else requestAnimationFrame(tick);
      };
      tick();
    })
  `);
  await page.eval(`
    document.fonts ? document.fonts.ready : Promise.resolve()
  `);
  await page.eval(`
    document.querySelectorAll("nextjs-portal").forEach((el) => el.remove());
  `);
  await sleep(200);
}

async function pickGrade(page, grade = 4) {
  await page.eval(`
    (() => {
      const tiles = document.querySelectorAll(".setup-stage fieldset:first-of-type .mission-tile");
      tiles[${grade} - 3].click();
    })()
  `);
  await page.eval(`
    new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        if (document.querySelector(".setup-stage fieldset:nth-of-type(2)")) resolve(true);
        else if (Date.now() - start > 4000) resolve(false);
        else requestAnimationFrame(tick);
      };
      tick();
    })
  `);
  await sleep(180);
}

async function pickSkill(page, label) {
  await page.eval(`
    (() => {
      const tiles = [...document.querySelectorAll(".setup-stage fieldset:nth-of-type(2) .mission-tile")];
      const match = tiles.find((tile) => (tile.textContent || "").toUpperCase().includes("${label.toUpperCase()}"));
      if (!match) throw new Error("missing skill ${label}");
      match.click();
    })()
  `);
  await sleep(160);
}

async function scrollBoard(page, where) {
  await page.eval(`
    (() => {
      const y = "${where}" === "end"
        ? document.documentElement.scrollHeight
        : 0;
      window.scrollTo(0, y);
    })()
  `);
  await sleep(200);
}

for (const vp of viewports) {
  const { page, targetId } = await openPage(vp.width, vp.height);

  await loadSetup(page, "light");
  await pickGrade(page);
  await shot(page, `review-${vp.name}-light`);
  await scrollBoard(page, "end");
  await shot(page, `review-${vp.name}-light-scrolled`);
  await pickSkill(page, "Multiplication");
  await shot(page, `review-${vp.name}-light-selected`);

  await loadSetup(page, "dark");
  await pickGrade(page);
  await pickSkill(page, "Geometry");
  await shot(page, `review-${vp.name}-dark`);
  await scrollBoard(page, "end");
  await shot(page, `review-${vp.name}-dark-scrolled`);

  await browser.send("Target.closeTarget", { targetId });
  page.ws.close();
}

browser.ws.close();
chrome.kill("SIGKILL");
console.log("done");
