# @hryvinskyi/magento2-e2e

A [Playwright](https://playwright.dev) framework for the storefront of a Magento 2 shop. It turns the
parts every Magento end-to-end suite ends up rebuilding into one tested package:

- a **store and environment model**: the shop's store views, and the places the tests can run (a local
  copy, staging, the live shop), picked with `E2E_ENV`;
- **safety tags** that a fixture enforces, so a test that writes can never run against the live shop;
- **module-owned tests**: a test lives in `Test/E2e/` of the module whose rule it guards, and runs only
  while that module is enabled, whether the module is in `app/code` or a Composer package;
- a **config factory** with a project per browser and suite, evidence for reports read outside the team,
  and a check that the site answers before a run starts;
- **storefront mechanics** shops share: consent recorded before the first visit, page guards, blocked
  requests, deferred assets, an optional guard that keeps a production run's writes on the shop's own
  origins;
- **test orders**: real orders a shop with `hryvinskyi/magento2-test-order` recognises and ends again, so a
  run can go through the whole checkout without an ordinary order being placed;
- Node loaders that run a module's **AMD script** or the shop's **jQuery** without a browser;
- **CI tooling**: a workflow, a deployment hook, a shared report behind a login, and a summary e-mail.

Page objects stay in your project: they depend on your theme and your checkout. The package names no
shop, no consent platform, no search service and no marketing tool; your project definition supplies
those specifics.

Requirements: Node 20.12 or newer, `@playwright/test` 1.51 or newer (a peer dependency, so your project
has exactly one copy of the runner), TypeScript 5.x.

## Install

```
echo 'allow-git=root' >> .npmrc
npm install --save-dev "@hryvinskyi/magento2-e2e@git+https://github.com/hryvinskyi/magento2-e2e.git#v1.1.0"
```

npm 12 refuses git dependencies unless the project opts in, which that line in `.npmrc` does; earlier
versions ignore it. The package is installed from its git tag, or from a tarball made with `npm run compile && npm pack`. A tag
holds the built `dist/`, so an install builds nothing and runs no script of this package. Never install it
with `npm link` or a `file:` directory path: the linked copy resolves `@playwright/test` from its own
`node_modules`, and two copies of the runner refuse to load.

To start a project, copy the package's `templates/project/` (from the clone, or from
`node_modules/@hryvinskyi/magento2-e2e/` after a first install) to `e2e/` in the root of the Magento
installation. It holds a working `playwright.config.ts`, `src/project.ts`, `src/fixtures.ts`,
`tsconfig.json`, `package.json`, `.env.example`, `allurerc.mjs`, and `gitignore` and `npmrc`, which npm
would drop from the package under their real names: rename them to `.gitignore` and `.npmrc`. Then:

```
cd e2e
mv gitignore .gitignore
mv npmrc .npmrc
npm install
npx playwright install chromium
cp .env.example .env     # and set what your environment needs
npx playwright test
```

## The project definition

`src/project.ts` describes the shop once. `defineProject()` checks it and refuses a definition that
contradicts itself (a default store that is not one of the stores, a production environment that skips
certificate checks), naming every problem.

```ts
import { consentCookie, defineProject } from '@hryvinskyi/magento2-e2e';
import type { EnvironmentDefinition, Store } from '@hryvinskyi/magento2-e2e';

export const STORES: { readonly en: Store; readonly fr: Store } = {
    en: { code: 'en', path: '/', locale: 'en-GB' },
    fr: { code: 'fr', path: '/fr/', locale: 'fr-FR' },
};

export const ENVIRONMENTS: {
    readonly local: EnvironmentDefinition;
    readonly production: EnvironmentDefinition;
} = {
    local: { baseUrl: store => `https://shop.test${store.path}`, ignoreHttpsErrors: true },
    production: { baseUrl: store => `https://www.example.com${store.path}`, production: true, workers: 2 },
};

declare module '@hryvinskyi/magento2-e2e' {
    interface Register {
        stores: typeof STORES;
        environments: typeof ENVIRONMENTS;
    }
}

export const project = defineProject({
    name: 'Acme',
    magentoRoot: '/var/www/shop',
    stores: STORES,
    defaultStore: 'en',
    environments: ENVIRONMENTS,
    defaultEnvironment: 'local',
    consent: consentCookie('visitor-consent', 'necessary-only'),
});
```

**Stores.** A store has a `code`, a `path` below its host (leading and trailing slash: `/`, `/fr/`) and
the browser `locale` it is tested with. Extend `Store` with your own fields (a host label, a currency)
and read them back in tests.

**Environments.** Each has a `baseUrl(store, variables)` resolver. `production: true` marks the live
shop; `ignoreHttpsErrors` is refused together with it; `searchServiceOptional: true` lets that
environment accept `E2E_SEARCH_SERVICE=off`; `workers` fixes the worker count there. `E2E_ENV` picks one,
an unknown name is refused with the known ones, and `defaultEnvironment` is used when it is unset.
`E2E_BASE_URL_<STORE CODE>` replaces one store's address in any environment.

**The `Register` augmentation.** Declare `Register` once, as above, and `StoreCode`, `RegisteredStore`
and `EnvironmentName` become your project's own unions everywhere: `test.use({ storeCode: 'fr' })`
accepts only your codes and `storefront.store` has your extra fields. Without it they are `string`,
`Store` and `string`. Annotate the constants you pass to it (`STORES`, `ENVIRONMENTS`) with explicit
types, as the template does.

**Consent.** `consentCookie(name, value)` records the visitor's consent as the cookie your consent
banner reads, before the first page opens, unless the browser already holds a cookie of that name.
Any object with `beforeVisit(context, baseUrl)` works as a `ConsentPolicy`.

**Page guards** run on the `page` fixture before the test sees it. A page the test opens itself
(`context.newPage()`, a popup) has the context's blocked requests and write guard but none of the page
guards, which is how a test about an overlay gets a page without the overlay's guard.

| Guard | Does |
|---|---|
| `blockedHosts(/pattern/)` | aborts every request of the page to matching addresses |
| `sessionStorageFlag(key, value)` | presets a session-storage entry before the page's own scripts run, how a test tells an overlay it was already answered |
| `dismissOnSight(selector, dismiss)` | dismisses the overlay whenever it covers the page before an action or an assertion; `clickInside(selector)` is a ready dismissal that clicks a close button and falls back to Escape |

**Blocked requests** (`blockedRequests: RegExp[]`) are aborted on the `context` fixture of every test,
for traffic no test may send (analytics, trackers, a live service).

**Deferred assets** (`deferredAssets: { stylesheets, scripts }`, CSS selectors) name the stylesheets and
scripts your pages hold back until the first interaction. `storefront.applyDeferredStylesheets()` and
`storefront.runDeferredScripts()` release them, so an assertion about how something looks, or about
whether a script ran, is read from a page that has finished loading.

**Safety tags** are described below; `safetyTags: { '@order': testOrderSafetyRule }` adds the package's
rule for test orders beside the core three, and `{ '@seeded': { onProduction: false, refusal } }` a tag of
your own. `refusal(environment)` returns the reason a tag may not run in this run at all (for example, it
needs a secret the run was not given), or nothing.

**The write guard** (`productionWriteGuard: {}`, optionally `{ allowedOrigins: [...] }`) keeps a run
against the live shop from sending data anywhere but the shop. A run is guarded when
`environment.targetsProduction()` is true: its environment is marked `production`, or a store's address
in it has a live store's host, with or without `www.` (an `E2E_BASE_URL_<CODE>` override pointing at the
live shop). A subdomain of the live shop, such as a staging site, is not guarded. In a guarded run every
request that is not a `GET` or `HEAD` and goes to an origin outside the stores' own and `allowedOrigins`
is aborted, every WebSocket to another origin is closed, and service workers are blocked (what a service
worker sends never passes through a page route). It is an allow-list: a new payment form, tracker or
partner is refused without being named. A page route of your own that sends a request on with `route.continue()`
bypasses the guard; hand everything but requests to the shop on with `route.fallback()`. A file-level
`test.use({ serviceWorkers: 'allow' })` replaces the package's service-worker choice for that file, while
the context's write route still guards what pages send. Without the option nothing is guarded;
`blockServiceWorkers: true` blocks service workers regardless.

The guard covers what the browser sends through the `context` fixture. A context a test opens itself
(`browser.newContext()`) has neither the guard nor the blocked requests. Playwright's API client
(`request`, `page.request`, `context.request`) never passes through routes, so a test's own call through
it is not guarded. A route sees only the first URL of a redirect, and a 307 or 308 carries the method and
body on to wherever it points.

## The Playwright config

```ts
import { defineMagentoConfig } from '@hryvinskyi/magento2-e2e';
import { project } from './src/project';

export default defineMagentoConfig({ project, configDir: __dirname });
```

| Option | Meaning |
|---|---|
| `project` | the checked project definition |
| `configDir` | the directory of `playwright.config.ts`; its `.env`, `tsconfig.json` and every report live there |
| `testDir` | the project's storefront-wide tests, relative to `configDir`; `tests` by default |
| `devices` | the browsers (`{ name, device, grep?, grepInvert? }`), `device` being a name from Playwright's device list; `DEFAULT_DEVICES` by default |
| `preflight` | `false` never checks that the site answers; `E2E_PREFLIGHT=off` skips it for one run |
| `playwright` | Playwright settings applied last: each top-level key replaces the factory's, `use` is merged one level deep |

**Projects.** Every browser and every suite makes one Playwright project, named `<device>` plus the
suite:

| Suite | Project name | Where its tests are |
|---|---|---|
| the project's own | `<device>` | `testDir` below `configDir` |
| enabled `app/code` modules | `<device>-modules` | `app/code/*/*/Test/E2e` |
| Composer packages | `<device>-packages`, or `<device>-packages-<first directory>` when there are several groups | `Test/E2e` of each enabled package |

The default devices are `desktop` (Desktop Chrome, running everything but tests tagged `@mobile-only`)
and `mobile` (Pixel 7, running only tests tagged `@mobile`); `E2E_WEBKIT=1` adds `desktop-safari` and
`iphone` (needs `npx playwright install webkit`; it is Safari's engine, not iOS).

Packages are grouped by the first directory of their real path below the Magento root: `vendor` for
installed packages, `packages` for a Composer path repository, and so on. One group is the suite
`-packages`; with several, each is `-packages-vendor`, `-packages-packages`. Each suite's directory is the
nearest directory its packages share, and the Magento root itself is never a test directory, so a run
never walks `pub/` or `generated/`. A path repository installs a symbolic link and Playwright does not
descend into one, so the package directories are resolved to their real paths first.

**What the factory sets.** Timeouts (test 90 s, expect 15 s, action 20 s, navigation 60 s), full
parallelism, `trace: 'retain-on-failure'`, the environment's HTTP credentials and certificate rule, and
workers (the environment's `workers`; else 2, or 3 on CI on a run that does not target production). On CI (`CI` is
set) it retries twice and refuses a left-over `test.only`. Reporters: the console list and an HTML report
in `playwright-report/`; on CI also GitHub annotations and `test-results/junit.xml`; with
`E2E_EVIDENCE=1` also the results for the shared report in `allure-results/` and the JSON results in
`reports/results.json`, and every test keeps its video and screenshots. All outputs are absolute paths
below `configDir`, wherever the run was started.

**`.env`.** `<configDir>/.env` is read with Node's `process.loadEnvFile` and never overrides a variable
that is already set, so a CI job or `E2E_ENV=staging npx playwright test` wins over a developer's file.

**The project reaches the fixtures through `use.magentoProject`**, a worker option the factory sets. The
config file is evaluated again in every worker, so functions in the project definition (base URL
resolvers, page guards) arrive intact. Define them at the top level of the config's imports, not from
state built while the runner started.

**The preflight.** Before any test starts, the run opens the default store's home page in Chromium, with
the run's login and user agent and without anything the page would load, up to three times, ten seconds
apart. If it never answers 200, the run stops with one message instead of half an hour of red retries. It
is the browser the tests use, so a firewall that challenges other clients lets it through as it does them.
It does make every run, a Node-only module spec included, need a site: use `E2E_PREFLIGHT=off` (or
`preflight: false` in the config) for a run that needs none.

## Where tests live

A test belongs to the zone that owns the rule it guards, like the code and configuration for it.

| The rule is owned by | The test lives in |
|---|---|
| no single module: the storefront as a whole | `e2e/tests/**/*.spec.ts` (the config's `testDir`) |
| a module in `app/code` | `app/code/<Vendor>/<Module>/Test/E2e/*.spec.ts` |
| a Composer package | `Test/E2e/*.spec.ts` in the package |

Module tests run **only while the module is enabled** in `app/etc/config.php`: switching a module off
takes its tests out of the run, and removing it takes them with it. Package modules are found through
`vendor/composer/installed.json` (packages of type `magento2-module`, their registration files taken from
`autoload.files`). In CI the checkout must contain what discovery reads, which is what the workflow
template's sparse checkout lists; a project that does not commit `vendor/` runs `composer install
--no-scripts --no-plugins` first, because without `vendor/composer/installed.json` package tests are
silently not found.

A module's tests import the framework through one entry point:

```ts
import { expect, READONLY_TAG, test } from '@hryvinskyi/magento2-e2e';
```

They never import `@playwright/test` themselves (a test outside the project's directory would load a
second copy of the runner); the package re-exports `expect` and the types a test needs (`Page`,
`Locator`, `Response`, `Route`, `TestInfo`, ...). Files outside `e2e/` do not see `e2e/node_modules`, so
the project's `tsconfig.json` maps the package to where it is installed and includes the modules' test
directories; Playwright reads that file for every test:

```json
{
  "compilerOptions": {
    "paths": {
      "@hryvinskyi/magento2-e2e": ["./node_modules/@hryvinskyi/magento2-e2e"]
    }
  },
  "include": [
    "playwright.config.ts", "src/**/*.ts", "tests/**/*.ts",
    "../app/code/*/*/Test/E2e/**/*.ts", "../vendor/*/*/Test/E2e/**/*.ts"
  ]
}
```

(The template has it.) A test in a module may also import files in its own `Test/E2e/`, never another
module's.

## Writing a test

```ts
import { expect, READONLY_TAG, test } from '@hryvinskyi/magento2-e2e';

test.use({ storeCode: 'fr' });

test('the French home page names the shop', { tag: READONLY_TAG }, async ({ storefront, page }) => {
    await storefront.open();                    // the store's home page; consent and guards are in place
    await expect(page).toHaveTitle(/Acme/);
});
```

Fixtures: `storefront` (the store `storeCode` picks, the project's default when unset), `storefrontOf(code)`
(any other store on the same page, to compare two stores), `freshGuest()` (starts over as a new guest on
the same page and the same guarded context), `environment` (the run's environment), `testOrders` (see *Test orders*), and the
automatic `safetyGuard` and `searchServiceGuard`. `storefront.open(path)` and `storefront.url(path)` take a path
relative to the store's base URL, so a store below a path keeps working.

`evidence('what the reader sees', pageOrLocator)` attaches a named screenshot of the moment a rule held
to the report; it does nothing unless the run keeps evidence (`E2E_EVIDENCE=1`). Other helpers:
`perStoreValue(name, table)` (a value recorded per store that `E2E_<NAME>_<STORE CODE>` replaces),
`RequestsInFlight`, `Arrivals`, `ClickReports`, `tabToNextControl(page)` and `pageModule(page, name)`
(the page's own RequireJS module as a handle).

## Safety tags

Every test declares **exactly one** safety tag. A fixture, not a command-line filter, enforces it, so no
flag can bypass it: a test with none or with two fails with a message naming it, and a test whose tag
may not run in the environment is skipped, saying why. A fixture cannot reach a `beforeAll` hook, which
runs before the guard, also when every test of the file is then skipped: nothing that writes belongs in
one.

| Tag | May do | Runs on production |
|---|---|---|
| `@readonly` | open pages, read | yes |
| `@cart` | create a guest cart, walk the checkout up to the pay button | yes |
| `@mutating` | anything that persists: place an order, register or log in a customer, submit a form | never |
| `@order` | place a test order the shop recognises, and abandon it; a project opts in with `testOrderSafetyRule` | up to the payment window, with `productionWriteGuard` |

Your project adds tags (`safetyTags` in the definition) beside these; the project's tag may also carry a
refusal, as `testOrderSafetyRule` does: it refuses `@order` in a run that has no secret to sign requests
with. `@search` is not a safety tag: it marks a test that needs the shop's search service, and
the test is skipped where the run says `E2E_SEARCH_SERVICE=off`. `@mobile` and `@mobile-only` choose the
devices a test runs on. Any other tag (`@smoke`) is yours to use with `--grep`.

## Test orders

A test order is a real order the shop recognises as a test, placed by a test that ends it again. It lets a
run go through the real checkout, on the live shop too, up to the payment window. It needs the Magento
module `hryvinskyi/magento2-test-order` in the shop. Recognising an order is all that module does for your
integrations: each of them has to opt out, and a shop that opts nothing out gets orders they act on, so
read its README first.

**Adding the tag.** `@order` is not one of the core tags. A project adds it, and on the live shop it also
needs the write guard, which keeps the payment window and every tracker of the page from receiving a write
from the test:

```ts
import { defineProject, TEST_ORDER_TAG, testOrderSafetyRule } from '@hryvinskyi/magento2-e2e';

export const project = defineProject({
    // ...
    safetyTags: { [TEST_ORDER_TAG]: testOrderSafetyRule },
    productionWriteGuard: {},
});
```

An `@order` test is skipped without the secret, and on a run that targets the live shop it is skipped
without `productionWriteGuard`. A test without the tag that asks for the `testOrders` fixture fails before
anything reaches the shop, and so does a test in a project that did not add the tag.

**The secret.** `E2E_TEST_ORDER_SECRET` holds the value of `test_order/proof_secret` in the `env.php` of the
environment the run targets, at least 32 bytes long. Give each environment its own: whoever holds it can
place orders the shop's integrations ignore, and cancel them. The workflow template maps one secret to each
environment, and keeps `@order` out of the nightly run. Tag `@order` tests `@smoke` as well to run them
after a deployment.

**How far an order goes.** `testOrders.reach` is `payment-window` or `success-page`. It is `success-page`
only where the environment says `paysTestOrders: true` and the run does not target the live shop, so set
that only where the shop is known to run on the provider's test keys. A test honours `testOrders.reach`
itself: the package has no payment page, so nothing refuses a test that pays anyway.

**A test.** Page objects are yours, so this one assumes a `checkout` of your project:

```ts
import { expect, signTestOrderPlacements, TEST_ORDER_TAG, test } from '@hryvinskyi/magento2-e2e';

test.use({ trace: 'off' });

test('a guest can buy by card', { tag: [TEST_ORDER_TAG, '@smoke'] }, async ({ page, testOrders }) => {
    const checkout = await openCheckoutWithOneProduct(page);
    const cart = await checkout.guestCartId();

    testOrders.carts.record(cart);

    const placements = await signTestOrderPlacements(page, testOrders.placementTerms(cart), /\/payment\/start/);

    try {
        await checkout.pressPay();
        await placements.placedOrder();
    } finally {
        placements.stopWatching();
    }

    expect((await testOrders.carts.abandon(cart)).kind).toBe('abandoned');
});
```

The order of those lines matters:

- The cart is recorded before the pay button is pressed, because the shop may create the order even when
  its answer never reaches the test. The signer refuses a cart that was not recorded.
- `signTestOrderPlacements()` comes before the press. It signs the one placement the terms allow and stops
  every other REST and GraphQL placement, which rejects `placedOrder()`. A placement no signing route saw is
  stopped too, and fails the test at its end, also when the page swallows the aborted request. Both cover a
  write to a cart's `payment-information` or `order` address and a GraphQL mutation that places or completes
  an order.
- `placedOrder()` resolves once the shop has answered the page's navigation to the address you gave, and
  rejects after 30 s without it; `deadlineMs` in the terms changes that. A script, a preload or a frame inside
  the page at a matching address does not count. The order is abandoned only after that, so no payment session
  is opened for an order already ended.
- `abandon()` answers `abandoned` only when every order of the cart ended. A cart with an order past cancelling
  answers `still-open` with the state it stays in, and fails the test at its end even if the test ignored the
  answer: it stays in the shop, and the shop's own clean-up will not end it.
- Whatever the test leaves is abandoned after it by the fixture, after a failure or a timeout too, and noted
  in the report. A cart that cannot be abandoned fails the test; the shop's own clean-up ends it later.

**The masked cart id** is `window.checkoutConfig.quoteData.entity_id` on a stock checkout. It is a number for
a signed-in customer's cart, and only a guest cart's placement is signed.

**A side effect in the placement.** Nothing stops what a checkout carries in the placement itself, such as a
newsletter choice, unless the project says so. `testOrders.placementTerms(cart, refusal)` takes a function
that reads the JSON body of the placement and returns the reason to stop it, or nothing.

**Traces.** A trace records every request header, the proofs among them, so the `testOrders` fixture refuses
a test whose trace is not off, before it asks the shop anything. A file of `@order` tests sets
`test.use({ trace: 'off' })` at its top level, as Playwright takes no trace setting inside a `describe`.
Screenshots, videos and evidence stay.

**The shop's challenge.** `testOrders` talks to the shop through Playwright's API client. A shop whose
firewall challenges that client fails at the recognition probe, with the shop's answer, and nothing is
placed. A project whose firewall refuses that client overrides the `shopRequests` fixture with `test.extend`,
and the run's proofs go through the client it gives.

## Environment variables

| Variable | Meaning |
|---|---|
| `E2E_ENV` | the environment of the run; the project's default when unset |
| `E2E_BASE_URL_<STORE CODE>` | an `http(s)` URL that replaces one store's base URL in any environment; pointed at a live store's address, the run keeps production's safety rules, write guard and default worker count |
| `E2E_HTTP_USER`, `E2E_HTTP_PASSWORD` | HTTP authentication in front of a site, offered to any host that answers 401 |
| `E2E_USER_AGENT_SUFFIX` | appended to the browser's user agent; wins over the project's `userAgentSuffix` option; nothing is appended when neither is set |
| `E2E_SEARCH_SERVICE` | `on` (default) or `off`; `off` is accepted only where the environment is `searchServiceOptional` |
| `E2E_PREFLIGHT` | `on` (default) or `off`; `off` skips the check that the default store answers |
| `E2E_TEST_ORDER_SECRET` | the secret test orders are signed with, one per environment; unset, `@order` tests are skipped |
| `E2E_EVIDENCE` | `1` keeps every test's video and screenshots and writes the report results |
| `E2E_WEBKIT` | any value also runs Safari's engine |
| `E2E_<NAME>_<STORE CODE>` | replaces a value recorded with `perStoreValue(NAME, ...)` |
| `CI` | any value: two retries, `test.only` refused, GitHub and JUnit reporters |
| `E2E_TRIGGER`, `E2E_COMMIT` | what started the run (`deployment`, `nightly`, `manual`) and the commit under test, named in the shared report |
| `E2E_REPORT_TITLE` | the words the report and its e-mail are named with; `Storefront checks` by default |
| `E2E_REPORT_NAME` | the name of the Allure report (used by the `allurerc.mjs` template) |
| `E2E_REPORT_URL`, `E2E_REPORT_USER` | where the published report is, and its login name, for the e-mail |
| `E2E_REPORT_PASSWORD` | the report's password, read by `report-gate` only |
| `GITHUB_E2E_REPOSITORY`, `GITHUB_E2E_TOKEN` | read by the deployment hook |

## Continuous integration

`templates/github/e2e.yml` is a GitHub Actions workflow to copy to `.github/workflows/e2e.yml`. It runs
on a deployment announcement, nightly and by hand; checks out only what the tests and the module
discovery need; installs the project, the browsers and runs the tests; keeps the Playwright report with
its traces as a workflow artifact; builds and publishes the shared report; e-mails a summary; posts to
Slack when a run fails; and has a `promote` job that starts the production deployment when a staging run
is green. Every secret and variable it reads is listed in its header comment, and each optional step
does nothing while its setting is empty.

**The shared report** is an Allure report with videos and screenshots and without traces: a trace
records every request with its headers (a staging login, session cookies), and this report is read
outside the team. `magento-e2e strip-traces` removes the traces from the results, `allure generate`
builds the report, `magento-e2e report-gate` puts a login in front of it, and the workflow publishes it
to Cloudflare Pages. The gate is a `_worker.js` that holds the SHA-256 of `user:password` and serves
nothing without it, on every address of the project; without `E2E_REPORT_PASSWORD` it writes no file and
fails, so a report is never published without a login.

**The deployment hook** `templates/deploy-hook/notify-github.sh` is for any deployment tool that can run
a command after a release is activated. It sends a `repository_dispatch` event of type `site-deployed`
carrying the environment and the commit, which starts the workflow. It needs `GITHUB_E2E_REPOSITORY`
(`<owner>/<name>`) and a token (`GITHUB_E2E_TOKEN`, or the file `~/.config/magento-e2e/github-token`), and
it never fails a deployment: a release that is live is not rolled back because a notification could not
be sent.

## The CLI

`npx magento-e2e <command>`; an unknown command prints the usage and exits with 2.

| Command | Does |
|---|---|
| `strip-traces [allure-results]` | removes trace attachments (named `trace`, or a `.zip` source) from the Allure results, deletes their files, drops the empty `trace` steps, prints how many |
| `summary [reports/results.json]` | writes `summary-subject.txt` and `summary.html` next to Playwright's JSON results and appends `subject=` to `$GITHUB_OUTPUT` when it is set. The subject reads `<title> <environment>, <trigger>: <verdict> (<passed>/<total>)`. It reads `E2E_REPORT_TITLE`, `E2E_ENV`, `E2E_TRIGGER`, `E2E_COMMIT`, `E2E_REPORT_URL` and `E2E_REPORT_USER`; the password never appears |
| `report-gate [allure-report]` | writes `_worker.js` into the built report with the SHA-256 of `E2E_REPORT_USER:E2E_REPORT_PASSWORD` and the sign-in realm `<E2E_REPORT_TITLE> test reports`; exits with 1 and writes nothing without a user and a password |

## Node-only module tests

A module's pure script (a rule, a calculation, a state model) can be tested without a browser or a site.

```ts
import path from 'node:path';
import { expect, loadAmdModule, loadMagentoJQuery, READONLY_TAG, test } from '@hryvinskyi/magento2-e2e';

test('the cart total adds the lines', { tag: READONLY_TAG }, () => {
    const total = loadAmdModule(path.join(__dirname, '../../view/frontend/web/js/total.js'), {
        'jquery': loadMagentoJQuery('/var/www/shop'),
    });

    expect(typeof total).toBe('function');
});
```

`loadAmdModule(file, dependencies)` runs a RequireJS (AMD) file in plain Node with a `define` that hands
the factory the values you give, keyed by the dependency ids exactly as the module writes them; an id you
did not provide fails the load and names it. `loadMagentoJQuery(magentoRoot)` loads the installation's own
`lib/web/jquery.js` against an inert document, so a module built on jQuery Deferreds runs against the real
implementation; only its DOM-free parts are meaningful. Both return values typed `unknown` or as a small
interface, which the test narrows before use.

These specs need no site, so run them with `E2E_PREFLIGHT=off`.

## Labelling test traffic

`E2E_USER_AGENT_SUFFIX` (or the project's `userAgentSuffix` option) appends a token to the browser's user
agent, so test traffic can be told apart in logs and analytics. That is all it does. **A user agent can be
forged by anyone**, so no protection (a bot filter, a rate limit, a firewall rule) may exempt traffic on
that token alone: whoever learns it can send anything under it. If a protection must let the tests
through, key it on something that cannot be copied, such as a secret header, a signed token or a source
address. The package ships no token of its own.

## Upgrading

Move to a release with one command that names its tag:

```
npm install --save-dev --allow-git=all "@hryvinskyi/magento2-e2e@git+https://github.com/hryvinskyi/magento2-e2e.git#v1.1.0"
```

Editing the tag in `package.json` is not enough: npm 10 quietly keeps the locked commit, and npm 11 and 12
refuse, because a dependency whose tag differs from the lockfile's no longer counts as the project's own
under `allow-git=root`. `--allow-git=all` holds for that one command; `npm ci` afterwards needs nothing
more than the line in `.npmrc`. Read
[CHANGELOG.md](CHANGELOG.md) first; the package follows semantic versioning, and its public API is what
`src/index.ts` exports. After upgrading run your project's `typecheck` (the declared types are the
contract) and one run against a local copy.

## Developing the package

```
npm ci
npm run typecheck        # the package, the reference consumer project, and the starter templates
npm run lint
npm run compile
npm run typecheck:dist   # the consumer against the built declarations, with skipLibCheck off
npx playwright install chromium
npm test                 # unit specs, browser specs, and the consumer project run end to end
```

`dist/` is committed, because a tag is what projects install: rebuild it with `npm run compile` and commit
it with the change. CI fails when it differs from what the sources build. The script is deliberately not
called `build`: npm runs a full install of a git dependency's dev dependencies when it finds one.

`test/consumer/` is a complete project (stores, environments, consent, page guards, a write guard,
modules, a Composer package and a path-repository package) that the suite runs with Playwright in child
processes. It loads the package from `src/` through its `tsconfig` paths, not as an installed package; the
built declarations are what `typecheck:dist` checks.

## Licence

MIT, see [LICENSE](LICENSE).
