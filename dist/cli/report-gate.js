"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportGateCommand = void 0;
exports.credentialsDigest = credentialsDigest;
exports.workerSource = workerSource;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const variables_1 = require("../environment/variables");
const report_title_1 = require("./report-title");
/** The file Cloudflare Pages runs in front of every request to the site it sits in. */
const WORKER_FILE = '_worker.js';
/**
 * The part of the worker that does not depend on the login: it compares the SHA-256 of the
 * `Authorization` header's `user:password` with `EXPECTED_SHA256`, in time that does not depend on
 * where the two differ, and serves the site's files only when they match. `EXPECTED_SHA256` and
 * `CHALLENGE` are declared above it.
 */
const WORKER_BODY = `
const REFUSED = {
    status: 401,
    headers: {
        'WWW-Authenticate': CHALLENGE,
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
        'Content-Type': 'text/plain; charset=utf-8',
    },
};

async function sha256Hex(bytes) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);

    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function sameText(a, b) {
    if (a.length !== b.length) {
        return false;
    }

    let difference = 0;

    for (let i = 0; i < a.length; i += 1) {
        difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return difference === 0;
}

async function signedIn(request) {
    const [scheme, encoded] = (request.headers.get('Authorization') ?? '').split(' ');

    if (scheme !== 'Basic' || !encoded) {
        return false;
    }

    let login;

    try {
        login = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
    } catch {
        return false;
    }

    return sameText(await sha256Hex(login), EXPECTED_SHA256);
}

export default {
    async fetch(request, env) {
        if (!(await signedIn(request))) {
            return new Response('Sign in to see the test reports.', REFUSED);
        }

        const response = await env.ASSETS.fetch(request);
        const headers = new Headers(response.headers);

        headers.set('Cache-Control', 'private, no-store');
        headers.set('X-Robots-Tag', 'noindex, nofollow');

        return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    },
};
`;
/** SHA-256 of `user:password` in hex: the only form of the login the worker holds. */
function credentialsDigest(user, password) {
    return (0, node_crypto_1.createHash)('sha256').update(`${user}:${password}`, 'utf8').digest('hex');
}
/**
 * The source of the gate in front of the shared test report on Cloudflare Pages: every request, on
 * every address of the project, needs the report's login, and the worker never serves a file itself.
 * Only the digest of the login is written into it, never the password.
 *
 * @param digest the hex SHA-256 of `user:password`
 * @param realm  the name the browser's sign-in prompt shows
 */
function workerSource(digest, realm) {
    // A quote or a control character would end the header's quoted string early.
    const safeRealm = realm.replace(/["\\]|\p{Cc}/gu, '');
    const challenge = `Basic realm="${safeRealm}", charset="UTF-8"`;
    return `// The gate in front of the shared test report: nothing is served without the report's login.\n`
        + `const EXPECTED_SHA256 = ${JSON.stringify(digest)};\n`
        + `const CHALLENGE = ${JSON.stringify(challenge)};\n${WORKER_BODY}`;
}
exports.reportGateCommand = {
    usage: '[report-directory]',
    summary: 'Writes _worker.js into a built report: nothing is served without E2E_REPORT_USER and E2E_REPORT_PASSWORD',
    run(args, context) {
        const user = (0, variables_1.setting)(context.variables, 'E2E_REPORT_USER');
        const password = context.variables.E2E_REPORT_PASSWORD;
        if (user === undefined || password === undefined || password === '') {
            context.err('report-gate: E2E_REPORT_USER and E2E_REPORT_PASSWORD must both be set; '
                + 'a report is never published without a login, so no gate was written.');
            return 1;
        }
        const dir = node_path_1.default.resolve(context.cwd, args[0] ?? 'allure-report');
        const file = node_path_1.default.join(dir, WORKER_FILE);
        node_fs_1.default.mkdirSync(dir, { recursive: true });
        node_fs_1.default.writeFileSync(file, workerSource(credentialsDigest(user, password), `${(0, report_title_1.reportTitle)(context.variables)} test reports`));
        context.out(`Wrote the report gate to ${file}`);
        return 0;
    },
};
