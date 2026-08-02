import { WebSocket } from 'ws';
import type { Server } from 'http';
import type { ServerMessage } from './types.js';
export declare function createWsHub(server: Server): {
    wss: import("ws").Server<typeof WebSocket, typeof import("http").IncomingMessage>;
    broadcast: (message: ServerMessage) => void;
    send: (socket: WebSocket, message: ServerMessage) => void;
    openClientCount: () => number;
    setClientChangeHandler: (handler: (count: number) => void) => void;
};
export type WsHub = ReturnType<typeof createWsHub>;
