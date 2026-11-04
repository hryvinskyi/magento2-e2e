// The storefront of the consumer project: a page server on E2E_CONSUMER_PORT, answering on every
// address of the machine, so `localhost` and `127.0.0.1` are two origins of one server. Every request
// it receives is appended to E2E_CONSUMER_LOG as one JSON line, which the runs read afterwards.
import { Buffer } from 'node:buffer';
import { appendFileSync } from 'node:fs';
import http from 'node:http';
import process from 'node:process';

const port = Number(process.env.E2E_CONSUMER_PORT);
const log = process.env.E2E_CONSUMER_LOG;
const homeStatus = Number(process.env.E2E_CONSUMER_HOME_STATUS ?? '200');

if (!Number.isInteger(port) || port <= 0) {
    throw new Error('E2E_CONSUMER_PORT must name the port to listen on.');
}

if (!Number.isInteger(homeStatus) || homeStatus < 100 || homeStatus > 599) {
    throw new Error('E2E_CONSUMER_HOME_STATUS must be an HTTP status.');
}

const PAGE = '<!doctype html><html><head><title>Consumer shop</title></head><body><p>shop</p></body></html>';

/**
 * @param {http.IncomingMessage} request
 * @param {string} body
 */
function record(request, body) {
    if (log === undefined || log === '') {
        return;
    }

    const entry = { method: request.method ?? 'GET', host: request.headers.host ?? '', path: request.url ?? '/', body };

    appendFileSync(log, `${JSON.stringify(entry)}\n`);
}

/**
 * @param {string} path
 * @returns {number}
 */
function statusOf(path) {
    return path === '/' ? homeStatus : 200;
}

const server = http.createServer((request, response) => {
    /** @type {Buffer[]} */
    const chunks = [];

    request.on('data', (/** @type {Buffer} */ chunk) => {
        chunks.push(chunk);
    });
    request.on('end', () => {
        const path = request.url ?? '/';

        if (path !== '/ready') {
            record(request, Buffer.concat(chunks).toString('utf8'));
        }

        response.writeHead(statusOf(path), { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
        response.end(PAGE);
    });
});

server.listen(port);

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
        server.closeAllConnections();
        server.close(() => process.exit(0));
    });
}
