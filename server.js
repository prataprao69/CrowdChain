// server.js
// Tiny static file server for the frontend.
// Run with: npm start

const http = require("http");
const fs   = require("fs");
const path = require("path");

const PORT        = 3000;
const FRONTEND    = path.join(__dirname, "frontend");

const MIME = {
  ".html": "text/html",
  ".css":  "text/css",
  ".js":   "application/javascript",
  ".json": "application/json",
  ".png":  "image/png",
  ".ico":  "image/x-icon",
};

const server = http.createServer((req, res) => {
  // Default to index.html
  let filePath = path.join(FRONTEND, req.url === "/" ? "index.html" : req.url);
  const ext    = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[ext] || "text/plain" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n✅ CrowdChain frontend running at: http://localhost:${PORT}\n`);
  console.log("Open that URL in your browser with MetaMask installed.");
  console.log("Press Ctrl+C to stop.\n");
});