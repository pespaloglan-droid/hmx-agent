// Read-only Chrome 144+ connection probe. No profile copy or tab operations.
import { closeSync, lstatSync, openSync, readSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function readEndpoint(file) {
  const info = lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 4096) {
    throw new Error("Invalid discovery file");
  }
  const fd = openSync(file, "r");
  const bytes = Buffer.alloc(4097);
  let length;
  try {
    length = readSync(fd, bytes, 0, bytes.length, 0);
  } finally {
    closeSync(fd);
  }
  if (length > 4096) throw new Error("Invalid discovery file");
  const lines = bytes.subarray(0, length).toString("utf8")
    .replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const [port, browserPath] = lines;
  if (lines.length !== 2 || !/^[0-9]{1,5}$/.test(port) ||
      Number(port) < 1 || Number(port) > 65535 ||
      !/^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(browserPath)) {
    throw new Error("Invalid discovery file");
  }
  // Never accept a remote host or fall back to probing arbitrary ports.
  return `ws://127.0.0.1:${Number(port)}${browserPath}`;
}

export function probeVersion(endpoint, { Socket = WebSocket, timeoutMs = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    const socket = new Socket(endpoint);
    let finished = false;
    const timer = setTimeout(() => finish(new Error("TIMEOUT")), timeoutMs);
    function finish(error, version) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      // Close only this connection. Never send Browser.close or close tabs.
      try { socket.close(); } catch { /* A failed socket may already be closed. */ }
      if (error) reject(error);
      else resolve(version);
    }
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ id: 1, method: "Browser.getVersion" }));
    });
    socket.addEventListener("message", (event) => {
      let reply;
      try { reply = JSON.parse(String(event.data)); }
      catch { finish(new Error("INVALID_REPLY")); return; }
      if (reply.id !== 1) return;
      const { product, protocolVersion } = reply.result || {};
      if (reply.error || typeof product !== "string" ||
          !/^Chrome\/[0-9.]+$/.test(product) ||
          typeof protocolVersion !== "string" || !/^[0-9.]+$/.test(protocolVersion)) {
        finish(new Error("INVALID_REPLY"));
        return;
      }
      finish(null, { product, protocolVersion });
    });
    socket.addEventListener("error", () => finish(new Error("CONNECTION_FAILED")));
    socket.addEventListener("close", () => finish(new Error("CONNECTION_CLOSED")));
  });
}

async function main() {
  if (process.platform !== "win32" || !process.env.LOCALAPPDATA ||
      typeof WebSocket !== "function") {
    console.error("Bu test Windows ve WebSocket destekli Node.js gerektirir.");
    process.exitCode = 1;
    return;
  }
  let endpoint;
  try {
    endpoint = readEndpoint(join(process.env.LOCALAPPDATA, "Google", "Chrome",
      "User Data", "DevToolsActivePort"));
  } catch {
    console.error("Chrome baglanti dosyasi okunamadi veya gecersiz. Chrome'u ve Remote debugging ayarini kontrol edin.");
    process.exitCode = 1;
    return;
  }
  console.log("Chrome baglanti onayi bekleniyor (en fazla 60 saniye).");
  console.log("Bu komutu siz baslattiysaniz Chrome'daki baglanti istegini onaylayin.");
  try {
    const version = await probeVersion(endpoint);
    console.log(`BAGLANTI BASARILI: ${version.product}; CDP ${version.protocolVersion}`);
    console.log("Yalnizca surum okundu. Profil hesabi ve Flow oturumu dogrulanmadi.");
  } catch (error) {
    console.error(error.message === "TIMEOUT"
      ? "Onay/baglanti zaman asimina ugradi. Chrome penceresindeki istegi kontrol edin."
      : "Baglanti kurulamadi. Chrome onayini ve Remote debugging ayarini kontrol edin.");
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}