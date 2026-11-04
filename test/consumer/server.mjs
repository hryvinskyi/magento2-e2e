// The storefront of the consumer project: a page server on E2E_CONSUMER_PORT, answering on every
// address of the machine, so `localhost` and `127.0.0.1` are two origins of one server. Every request
// it receives is appended to E2E_CONSUMER_LOG as one JSON line, which the runs read afterwards.
//
// It also answers the shop's test-order routes. The shop's secret is E2E_CONSUMER_SHOP_SECRET and not
// the runner's E2E_TEST_ORDER_SECRET: a web server inherits the run's environment, so with the runner's
// variable the two could never disagree.
import { Buffer } from 'node:buffer';
import { createHmac } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import http from 'node:http';
import process from 'node:process';

const port = Number(process.env.E2E_CONSUMER_PORT);
const log = process.env.E2E_CONSUMER_LOG;
const homeStatus = Number(process.env.E2E_CONSUMER_HOME_STATUS ?? '200');
const shopSecret = process.env.E2E_CONSUMER_SHOP_SECRET ?? '';
const abandonedState = process.env.E2E_CONSUMER_ABANDONED_STATE ?? 'canceled';

if (!Number.isInteger(port) || port <= 0) {
    throw new Error('E2E_CONSUMER_PORT must name the port to listen on.');
}

if (!Number.isInteger(homeStatus) || homeStatus < 100 || homeStatus > 599) {
    throw new Error('E2E_CONSUMER_HOME_STATUS must be an HTTP status.');
}

const PAGE = '<!doctype html><html><head><title>Consumer shop</title></head>'
    + '<body><p>shop</p><img src="/page-asset.png" alt=""></body></html>';

const RECOGNITION = /^\/rest\/[^/]+\/V1\/test-orders\/recognition$/;
const ABANDON = /^\/rest\/[^/]+\/V1\/test-orders\/([^/]+)\/abandon$/;
const JSON_TYPE = 'application/json';

/** @typedef {{ readonly status: number, readonly type: string, readonly body: string }} Answer */

/** @type {Answer} */
const PROOF_REFUSED = { status: 401, type: JSON_TYPE, body: JSON.stringify({ message: 'The test-order proof was refused.' }) };

/**
 * @param {http.IncomingMessage} request
 * @param {string} body
 */
function record(request, body) {
    if (log === undefined || log === '') {
        return;
    }

    const entry = {
        method: request.method ?? 'GET',
        host: request.headers.host ?? '',
        path: request.url ?? '/',
        accept: request.headers.accept ?? '',
        client: request.headers['x-consumer-client'] ?? '',
        body,
    };

    appendFileSync(log, `${JSON.stringify(entry)}\n`);
}

/**
 * @param {string} path
 * @returns {number}
 */
function statusOf(path) {
    return path === '/' ? homeStatus : 200;
}

/**
 * Whether a proof is `<unix-seconds>.<signature>` for this action and subject, made with the shop's secret.
 *
 * @param {string | string[] | undefined} proof
 * @param {string} action
 * @param {string} subject
 * @returns {boolean}
 */
function proves(proof, action, subject) {
    if (shopSecret === '' || typeof proof !== 'string') {
        return false;
    }

    const [seconds = '', signature] = proof.split('.');

    return signature === createHmac('sha256', shopSecret).update(`${action}|${subject}|${seconds}`, 'utf8').digest('hex');
}

/**
 * The shop's answer to a test-order route; nothing for any other request.
 *
 * @param {http.IncomingMessage} request
 * @param {string} path
 * @returns {Answer | undefined}
 */
function testOrderAnswer(request, path) {
    const proof = request.headers['x-test-order-proof'];
    const abandoned = ABANDON.exec(path);

    if (request.method !== 'POST') {
        return undefined;
    }

    if (RECOGNITION.test(path)) {
        return proves(proof, 'recognise', 'recognition') ? { status: 200, type: JSON_TYPE, body: 'true' } : PROOF_REFUSED;
    }

    if (abandoned === null) {
        return undefined;
    }

    return proves(proof, 'abandon', decodeURIComponent(abandoned[1] ?? ''))
        ? { status: 200, type: JSON_TYPE, body: JSON.stringify({ increment_id: '000000001', state: abandonedState, deleted: false }) }
        : PROOF_REFUSED;
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

        const answer = testOrderAnswer(request, path) ?? { status: statusOf(path), type: 'text/html', body: PAGE };

        response.writeHead(answer.status, { 'Content-Type': answer.type, 'Cache-Control': 'no-store' });
        response.end(answer.body);
    });
});

server.listen(port);

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
        server.closeAllConnections();
        server.close(() => process.exit(0));
    });
}
