// Servidor HTTP mínimo, sin dependencias externas.
// Muchas plataformas de despliegue (Koyeb, Render, Railway...) necesitan que
// el proceso escuche en un puerto y responda algo para considerarlo "vivo",
// aunque el bot en sí hable con Telegram por long polling, no por HTTP.
const http = require('node:http');

function startHealthServer() {
  const port = process.env.PORT || 3000;
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('agenda-bot activo\n');
  });
  server.listen(port, () => {
    console.log(`🌐 Servidor de salud escuchando en el puerto ${port} (solo para el healthcheck de la plataforma).`);
  });
}

module.exports = { startHealthServer };
