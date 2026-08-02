import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { ServerMessage } from './types.js';

export function createWsHub(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  let onClientChange: ((count: number) => void) | null = null;

  wss.on('connection', (socket) => {
    onClientChange?.(openClientCount());
    socket.on('close', () => onClientChange?.(openClientCount()));
  });

  function openClientCount() {
    let n = 0;
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) n += 1;
    }
    return n;
  }

  function broadcast(message: ServerMessage) {
    const raw = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(raw);
      }
    }
  }

  function send(socket: WebSocket, message: ServerMessage) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  function setClientChangeHandler(handler: (count: number) => void) {
    onClientChange = handler;
  }

  return { wss, broadcast, send, openClientCount, setClientChangeHandler };
}

export type WsHub = ReturnType<typeof createWsHub>;
