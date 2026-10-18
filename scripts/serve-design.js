// Serves design/v2/html on http://localhost:8090 for side-by-side visual checks against the app.
// node scripts/serve-design.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'design', 'v2', 'html');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

http
  .createServer((req, res) => {
    const name = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '') || 'Prototype.dc.html';
    const file = path.join(root, path.normalize(name));
    if (!file.startsWith(root) || !fs.existsSync(file)) {
      res.writeHead(404);
      return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    if (file.endsWith('.html')) {
      // the mockups lack a viewport tag; inject one so they render 1:1 at phone width
      const html = fs.readFileSync(file, 'utf8').replace('<head>', '<head><meta name="viewport" content="width=390, initial-scale=1">');
      return res.end(html);
    }
    fs.createReadStream(file).pipe(res);
  })
  .listen(8090, () => console.log('design files on http://localhost:8090'));
