let WebSocket = require("ws");
let express = require("express");
let app = express();
let server = app.listen(process.env.PORT || 3000);
let socketServer = new WebSocket.Server({ server });

app.use(express.static("."));

console.log("Testing");

socketServer.on("connection", (socket) => {
  socket.addEventListener("message", (event) => {
    console.log("Received message from client:", event.data);
    
    socketServer.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(event.data);
      }
    });
  });
});