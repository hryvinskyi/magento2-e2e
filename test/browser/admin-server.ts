import { createHash, randomUUID } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

/** Where a sign-in that the admin accepts takes the browser. */
export type AfterSignIn = 'dashboard' | 'two-factor' | 'elsewhere';

/** How the fake admin behaves. */
export interface FakeAdminOptions {
    readonly username: string;
    readonly password: string;
    /** Whether every admin address carries a secret key, and an address without the right one lands on the dashboard. */
    readonly secretKeys?: boolean;
    /** Whether the sign-in form asks for a CAPTCHA. */
    readonly captcha?: boolean;
    /** Where an accepted sign-in goes; the dashboard when unset. */
    readonly afterSignIn?: AfterSignIn;
    /** How long the product grid shows its loading mask after the page loaded. */
    readonly gridLoadingMs?: number;
}

/** A request the fake admin received. */
export interface AdminRequest {
    readonly method: string;
    readonly path: string;
    readonly body: string;
}

/** The admin's front name in every address this fake answers. */
export const FRONT_NAME = 'backoffice';

const HTML = 'text/html';
const SESSION_COOKIE = 'admin';

/**
 * A local stand-in for a Magento admin on 127.0.0.1, with the stock admin's markup: a sign-in form that
 * posts to the address it is on, a menu whose items carry `data-ui-id`, a messages area, loading masks,
 * the page's `FORM_KEY`, and, when asked for, a secret key in every address. It records every request.
 */
export class FakeAdmin {
    public readonly received: AdminRequest[] = [];
    private readonly options: FakeAdminOptions;
    private readonly server: http.Server;
    private readonly sessions = new Set<string>();

    private constructor(options: FakeAdminOptions) {
        this.options = options;
        this.server = http.createServer((request, response) => {
            this.receive(request, response);
        });
    }

    public static async start(options: FakeAdminOptions): Promise<FakeAdmin> {
        const admin = new FakeAdmin(options);

        await new Promise<void>(resolve => {
            admin.server.listen(0, '127.0.0.1', resolve);
        });

        return admin;
    }

    /** The admin's address, with a trailing slash. */
    public get adminUrl(): string {
        return `http://127.0.0.1:${String(addressOf(this.server).port)}/${FRONT_NAME}/`;
    }

    /** Ends every session, as a second sign-in of the same user does where the shop shares no accounts. */
    public endSessions(): void {
        this.sessions.clear();
    }

    /** The sign-ins the admin received. */
    public signIns(): readonly AdminRequest[] {
        return this.received.filter(request => request.method === 'POST' && request.body.includes('login%5Busername%5D'));
    }

    public async stop(): Promise<void> {
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

    private receive(request: http.IncomingMessage, response: http.ServerResponse): void {
        const chunks: Buffer[] = [];

        request.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
        });
        request.on('end', () => {
            const received = { method: request.method ?? 'GET', path: request.url ?? '/', body: Buffer.concat(chunks).toString('utf8') };

            this.received.push(received);
            this.answer(received, sessionOf(request.headers.cookie), response);
        });
    }

    private answer(request: AdminRequest, cookie: string | undefined, response: http.ServerResponse): void {
        const session = cookie !== undefined && this.sessions.has(cookie) ? cookie : undefined;
        const form = new URLSearchParams(request.body);
        const route = routeOf(request.path);

        if (request.method === 'POST' && form.has('login[username]')) {
            this.signIn(form, response);

            return;
        }

        if (session === undefined) {
            send(response, 200, signInPage({ captcha: this.options.captcha === true, error: cookie !== undefined }));

            return;
        }

        if (request.method === 'POST' && route.path === 'catalog/product/save') {
            const accepted = form.get('form_key') === formKeyOf(session);

            send(response, accepted ? 200 : 403, accepted ? 'saved' : 'invalid form key', 'text/plain');

            return;
        }

        if (this.options.secretKeys === true && route.key !== this.keyOf(route.path)) {
            redirect(response, this.address('admin/dashboard/index'));

            return;
        }

        send(response, 200, route.path === 'admin/blank/index' ? '<!doctype html><html><body><p>blank</p></body></html>' : this.page(route.path, session));
    }

    private signIn(form: URLSearchParams, response: http.ServerResponse): void {
        const accepted = this.options.captcha !== true
            && form.get('login[username]') === this.options.username
            && form.get('login[password]') === this.options.password;

        if (!accepted) {
            send(response, 200, signInPage({ captcha: this.options.captcha === true, error: true }));

            return;
        }

        const session = randomUUID();
        const destinations: Readonly<Record<AfterSignIn, string>> = {
            dashboard: this.address('admin/dashboard/index'),
            'two-factor': this.address('tfa/tfa/index'),
            elsewhere: this.adminUrl.replace('127.0.0.1', 'localhost'),
        };

        this.sessions.add(session);
        response.writeHead(302, {
            Location: destinations[this.options.afterSignIn ?? 'dashboard'],
            'Set-Cookie': `${SESSION_COOKIE}=${session}; Path=/${FRONT_NAME}/; HttpOnly`,
        });
        response.end();
    }

    /** The address of a route, with its secret key when the admin uses them. */
    private address(path: string): string {
        return `${this.adminUrl}${path}/${this.options.secretKeys === true ? `key/${this.keyOf(path)}/` : ''}`;
    }

    private keyOf(path: string): string {
        return createHash('sha256').update(`secret|${path}`).digest('hex').slice(0, 16);
    }

    private page(path: string, session: string): string {
        const products = this.address('catalog/product/index');
        const productFive = this.address('catalog/product/edit/id/5');
        const grid = path === 'catalog/product/index'
            ? `<div class="admin__data-grid-loading-mask" data-role="spinner">loading</div>
<script>setTimeout(function () { document.querySelector('[data-role="spinner"]').style.display = 'none'; }, ${String(this.options.gridLoadingMs ?? 0)});</script>`
            : '';
        const message = path === 'catalog/product/edit/id/5'
            ? '<div class="message message-success success"><div data-ui-id="messages-message-success">You saved the product.</div></div>'
            : '';

        return `<!doctype html><html><head><title>${path === '' ? 'dashboard' : path}</title>
<script>var FORM_KEY = '${formKeyOf(session)}';</script></head>
<body>
<nav class="admin__menu"><ul>
<li data-ui-id="menu-magento-backend-dashboard" class="item-dashboard level-0"><a href="${this.address('admin/dashboard/index')}"><span>Dashboard</span></a></li>
<li data-ui-id="menu-magento-catalog-catalog" class="item-catalog parent level-0"><a href="#" onclick="return false;"><span>Catalog</span></a>
<ul><li data-ui-id="menu-magento-catalog-catalog-products" class="item-catalog-products level-1"><a href="${products}"><span>Products</span></a></li></ul></li>
</ul></nav>
<div id="messages"><div class="messages">${message}</div></div>
<div class="loading-mask" data-role="loader" style="display: none"></div>
<h1 class="page-title">${path}</h1>
<a id="edit-five" href="${productFive}">Edit product 5</a>
<a id="nowhere" href="#">Nowhere</a>
${grid}
</body></html>`;
    }
}

/** The route of an address below the admin, and the secret key it carries. */
function routeOf(path: string): { readonly path: string; readonly key: string | undefined } {
    const segments = new URL(path, 'http://admin').pathname.split('/').filter(segment => segment !== '').slice(1);
    const key = segments.indexOf('key');

    return key === -1
        ? { path: segments.join('/'), key: undefined }
        : { path: segments.slice(0, key).join('/'), key: segments[key + 1] };
}

function signInPage({ captcha, error }: { readonly captcha: boolean; readonly error: boolean }): string {
    return `<!doctype html><html><head><title>Sign in</title></head><body>
${error ? '<div class="messages"><div class="message message-error error"><div>The account sign-in was incorrect.</div></div></div>' : ''}
<form method="post" action="" id="login-form">
<input name="form_key" type="hidden" value="sign-in-form-key">
<input id="username" name="login[username]" type="text">
<input id="login" name="login[password]" type="password">
${captcha ? '<input id="captcha" name="captcha[backend_login]" type="text">' : ''}
<button class="action-login action-primary">Sign in</button>
</form></body></html>`;
}

function formKeyOf(session: string): string {
    return `form-key-${session.slice(0, 8)}`;
}

function sessionOf(cookie: string | undefined): string | undefined {
    return cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
}

function send(response: http.ServerResponse, status: number, body: string, type = HTML): void {
    response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    response.end(body);
}

function redirect(response: http.ServerResponse, location: string): void {
    response.writeHead(302, { Location: location });
    response.end();
}

function addressOf(server: http.Server): AddressInfo {
    const address = server.address();

    if (address === null || typeof address === 'string') {
        throw new Error('The fake admin is not listening on a TCP port.');
    }

    return address;
}
