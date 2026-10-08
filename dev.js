// Run the mock API on your own computer: `node dev.js`, then open http://localhost:3000
const http = require('http');
const handler = require('./api/index');

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  let data = '';
  req.on('data', (chunk) => { data += chunk; });
  req.on('end', () => {
    req.body = data;
    handler(req, res);
  });
}).listen(PORT, () => console.log(`Mock API running at http://localhost:${PORT}`));
