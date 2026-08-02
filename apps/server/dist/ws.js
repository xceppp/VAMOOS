import { WebSocketServer, WebSocket } from 'ws';
export function createWsHub(server) {
    const wss = new WebSocketServer({ server, path: '/ws' });
    let onClientChange = null;
    wss.on('connection', (socket) => {
        onClientChange?.(openClientCount());
        socket.on('close', () => onClientChange?.(openClientCount()));
    });
    function openClientCount() {
        let n = 0;
        for (const client of wss.clients) {
            if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING)
                n += 1;
        }
        return n;
    }
    function broadcast(message) {
        const raw = JSON.stringify(message);
        for (const client of wss.clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(raw);
            }
        }
    }
    function send(socket, message) {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(message));
        }
    }
    function setClientChangeHandler(handler) {
        onClientChange = handler;
    }
    return { wss, broadcast, send, openClientCount, setClientChangeHandler };
}
