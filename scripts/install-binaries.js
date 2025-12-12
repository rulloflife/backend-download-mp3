const https = require("https");
const fs = require("fs");
const path = require("path");

function download(url, dest) {
  return new Promise((resolve, reject) => {
    console.log("Downloading:", url);

    const file = fs.createWriteStream(dest, { mode: 0o755 });

    https.get(url, res => {
      if (res.statusCode !== 200) {
        reject("Download failed: " + res.statusCode);
        return;
      }
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    }).on("error", reject);
  });
}

async function main() {
  const binDir = path.join(__dirname, "..", "bin");
  const ffmpegDir = path.join(__dirname, "..", "ffmpeg");

  if (!fs.existsSync(binDir)) fs.mkdirSync(binDir);
  if (!fs.existsSync(ffmpegDir)) fs.mkdirSync(ffmpegDir);

  // yt-dlp static binary ( ~14 MB )
  await download(
    "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux",
    path.join(binDir, "yt-dlp")
  );
  console.log("yt-dlp & ffmpeg installed successfully.");
}

main().catch(err => {
  console.error("Install failed:", err);
  process.exit(1);
});
