import { createHash } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';

/** One response the server gives for a path. */
export interface Served {
    readonly body: string;
    /** The answer's status; 200 when it names none. */
    readonly status?: number;
    readonly type?: string;
    readonly delayMs?: number;
    readonly headers?: Readonly<Record<string, string>>;
    /** Drops the connection once the request has arrived, instead of answering. */
    readonly dropConnection?: boolean;
}

/** A request as the server received it. */
export interface Received {
    readonly method: string;
    readonly path: string;
    readonly cookie: string | undefined;
    /** The request's headers, their names in lowercase as Node reads them. */
    readonly headers: http.IncomingHttpHeaders;
    readonly body: string;
}

/** The GUID a WebSocket handshake answer is derived with (RFC 6455, section 1.3). */
const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/**
 * A local HTTP server on a free port of 127.0.0.1 that answers the pages it was given, answers any
 * other path with an empty text, accepts WebSocket handshakes, and records everything that reached it.
 */
export class PageServer {
    public readonly received: Received[] = [];
    public readonly upgrades: string[] = [];
    private readonly pages: Readonly<Record<string, Served>>;
    private readonly server: http.Server;
    private readonly sockets = new Set<Duplex>();

    private constructor(pages: Readonly<Record<string, Served>>) {
        this.pages = pages;
        this.server = http.createServer((request, response) => {
            this.answer(request, response);
        });
        this.server.on('upgrade', (request: http.IncomingMessage, socket: Duplex) => {
            this.acceptWebSocket(request, socket);
        });
    }

    public static async start(pages: Readonly<Record<string, Served>>): Promise<PageServer> {
        const pageServer = new PageServer(pages);

        await new Promise<void>(resolve => {
            pageServer.server.listen(0, '127.0.0.1', resolve);
        });

        return pageServer;
    }

    /** `http://127.0.0.1:<port>`, the port the system chose. */
    public get origin(): string {
        return `http://127.0.0.1:${String(addressOf(this.server).port)}`;
    }

    /** The absolute URL of a path on this server. */
    public url(path: string): string {
        return `${this.origin}${path}`;
    }

    /** The requests that reached this path, in order. */
    public requestsTo(path: string): readonly Received[] {
        return this.received.filter(request => request.path === path);
    }

    public async stop(): Promise<void> {
        for (const socket of this.sockets) {
            socket.destroy();
        }

        this.server.closeAllConnections();
        await new Promise<void>((resolve, reject) => {
            this.server.close(error => {
                if (error === undefined) {
                    resolve();
                } else {
                    reject(error);
                }
            });
        });
    }

    private answer(request: http.IncomingMessage, response: http.ServerResponse): void {
        const path = request.url ?? '/';
        const page = Object.hasOwn(this.pages, path) ? this.pages[path] : undefined;
        const chunks: Buffer[] = [];

        request.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
        });
        request.on('end', () => {
            this.received.push({
                method: request.method ?? 'GET',
                path,
                cookie: request.headers.cookie,
                headers: request.headers,
                body: Buffer.concat(chunks).toString('utf8'),
            });

            if (page?.dropConnection === true) {
                request.socket.destroy();

                return;
            }

            setTimeout(() => {
                response.writeHead(page?.status ?? 200, {
                    'Content-Type': page?.type ?? 'text/plain',
                    'Cache-Control': 'no-store',
                    ...page?.headers,
                });
                response.end(page?.body ?? '');
            }, page?.delayMs ?? 0);
        });
    }

    /** Completes the handshake and keeps the socket open until the server stops; nothing is ever sent on it. */
    private acceptWebSocket(request: http.IncomingMessage, socket: Duplex): void {
        const key = request.headers['sec-websocket-key'];

        this.upgrades.push(request.url ?? '/');
        this.sockets.add(socket);

        if (typeof key !== 'string') {
            socket.destroy();

            return;
        }

        const accept = createHash('sha1').update(`${key}${WEBSOCKET_GUID}`).digest('base64');

        socket.write([
            'HTTP/1.1 101 Switching Protocols',
            'Upgrade: websocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Accept: ${accept}`,
            '',
            '',
        ].join('\r\n'));
    }
}

function addressOf(server: http.Server): AddressInfo {
    const address = server.address();

    if (address === null || typeof address === 'string') {
        throw new Error('The page server is not listening on a TCP port.');
    }

    return address;
}

/** A regular expression matching every URL below `origin`. */
export function below(origin: string): RegExp {
    return new RegExp(`^${origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`);
}
