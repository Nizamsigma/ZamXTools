const express = require("express");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "10kb" }));

const PORT = process.env.PORT || 8080;
const ORIGIN = process.env.ALLOWED_ORIGIN || "*"; // isi dengan alamat webmu agar lebih aman
const DIR = path.join(os.tmpdir(), "zamx");
fs.mkdirSync(DIR, { recursive: true });

// CORS
app.use((req, res, next) => {
  res.set({
    "Access-Control-Allow-Origin": ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Batas: 2 proses sekaligus, 8 permintaan/menit per IP (RAM gratis cuma 512 MB)
let busy = 0;
const MAX_BUSY = 2;
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 8;
}

// Halaman web ZamXTools (folder public/) — dilayani dari server yang sama
app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_, res) => res.json({ ok: true, name: "ZamXTools backend" }));

app.post("/download", (req, res) => {
  const { url, format = "video" } = req.body || {};

  let u;
  try {
    u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) throw new Error("bad protocol");
  } catch {
    return res.status(400).json({ error: "Link tidak valid" });
  }
  if (limited(req.ip)) return res.status(429).json({ error: "Terlalu banyak permintaan, coba lagi sebentar" });
  if (busy >= MAX_BUSY) return res.status(503).json({ error: "Server sedang sibuk, coba lagi" });

  busy++;
  const id = crypto.randomBytes(8).toString("hex");
  const args = ["--no-playlist", "--no-warnings", "--max-filesize", "80M", "-o", path.join(DIR, id + ".%(ext)s")];

  if (format === "audio") {
    args.push("-x", "--audio-format", "mp3");
  } else if (format === "image") {
    args.push("--skip-download", "--write-thumbnail", "--convert-thumbnails", "jpg");
  } else {
    args.push("-f", "b[ext=mp4]/bv*[ext=mp4]+ba[ext=m4a]/b", "--merge-output-format", "mp4");
  }
  args.push("--", u.href); // "--" mencegah link dibaca sebagai opsi

  let err = "";
  let finished = false;
  const p = spawn("yt-dlp", args);
  p.stderr.on("data", (d) => (err += d));
  const timer = setTimeout(() => p.kill("SIGKILL"), 120000);

  function finish(code) {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    busy--;
    const file = fs.readdirSync(DIR).find((n) => n.startsWith(id + "."));
    if (code !== 0 || !file) {
      const msg = err.trim().split("\n").pop() || "";
      return res.status(500).json({ error: "Gagal mengambil media. " + msg.slice(0, 200) });
    }
    setTimeout(() => fs.unlink(path.join(DIR, file), () => {}), 10 * 60 * 1000); // hapus setelah 10 menit
    const proto = req.get("x-forwarded-proto") || req.protocol;
    const base = process.env.BASE_URL || proto + "://" + req.get("host");
    res.json({ download_url: base + "/file/" + file });
  }
  p.on("close", finish);
  p.on("error", () => finish(1));
});

app.get("/file/:name", (req, res) => {
  const name = path.basename(req.params.name);
  if (!/^[a-f0-9]{16}\.[a-z0-9]+$/.test(name)) return res.sendStatus(404);
  const file = path.join(DIR, name);
  if (!fs.existsSync(file)) return res.sendStatus(404);
  res.download(file, "zamxtools-" + name);
});

app.listen(PORT, () => console.log("ZamXTools backend jalan di port " + PORT));
