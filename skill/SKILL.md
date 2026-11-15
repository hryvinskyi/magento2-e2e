---
name: magento-e2e-test
description: Write or update a Playwright end-to-end test for a Magento 2 storefront that uses @hryvinskyi/magento2-e2e. Use after implementing a bug fix, a feature or any change a customer can see or that alters storefront behaviour - prices, labels, cart, checkout, redirects, per-store rules, third-party widgets - and when asked to "cover this with a test", "add an e2e test", or to reproduce a storefront bug before fixing it. Also use when an existing e2e test fails and has to be diagnosed.
---

# E2E test for a storefront change

Every fix, feature and behaviour change that a customer can observe ships with a Playwright test that
would have caught the problem. A shop is too big to remember; the suite is the memory. The runner, the
fixtures and the page objects live in the project's `e2e/` directory; a test lives **with the module that
owns the rule it guards** (see *Where a test lives*).

Not everything is an e2e test. A calculation, a parser or a resolver is a unit test of the module that
owns it. Write an e2e test for what only a browser can show: what is rendered, in which store, after which
interaction.

## The order of work

1. **State the rule in one sentence, in business words.** *"A store that hides prices from guests shows
   them nowhere."* Not *"`PriceRenderer` checks `display_enabled`"*. The sentence becomes the
   `describe`/test title. If you cannot state it, you do not know yet what to assert.
2. **List every surface the rule is visible on, before writing anything.** This is the step that gets
   skipped and the reason bugs come back. The same piece of data is drawn by independent code paths, and a
   fix applied to one leaves the others:

   | Surface | Usually rendered by |
   |---|---|
   | category listing, search results page | the catalog's price and product templates |
   | product page | the product view templates, plus the price box |
   | recommendation or "related" widgets | their own template or an external service: no catalog template involved |
   | added-to-cart popup | its own template and script |
   | mini cart | a customer-data section plus a Knockout template |
   | cart page | the cart item template |
   | checkout summary | the checkout config provider plus a Knockout template |
   | search suggestions | the search module's own templates |
   | transactional e-mail | not reachable from a browser: say so, do not pretend |

   A rule applied to the price templates and the search templates while the mini cart and the cart page
   keep showing the old behaviour is the typical way a bug returns.
3. **Look at the real page before writing a selector.** Open it with the Playwright MCP
   (`browser_navigate` + `browser_evaluate`) or `npx playwright test --ui`. Never guess markup and never
   copy a selector from a tutorial: a theme and a checkout module differ from the stock ones.
4. **Reuse and extend the page objects** of the project. A selector appears in exactly one place. A new
   surface is a new page object (or a new locator on an existing one), not a `page.locator()` inside a
   spec.
5. **Write the test**, with exactly one safety tag (see *Safety tags*). Where it confirms a rule, call
   `evidence('<what the reader sees, in their words>', locatorOrPage)`: the report after a deployment is
   read outside the team, and a named screenshot of the moment a rule held tells more than the automatic
   one of how the test ended.
6. **Prove the test can fail** (see *A test that cannot fail is worse than no test*).
7. Run it, then run the whole suite: the project's `typecheck` and `npx playwright test`.
8. For a bug: the test is written and seen **red first**, then the fix, then green. Keep the red output
   for the ticket: it is the reproduction.

## Where a test lives

A test belongs to the zone that owns the rule, exactly like the code and configuration for it.

| The rule is owned by | The test lives in |
|---|---|
| one module (its config flag, its feature, its bug) | `app/code/<Vendor>/<Module>/Test/E2e/*.spec.ts`, or `Test/E2e/` of the Composer package |
| no single module: the storefront as a whole | `e2e/tests/<area>/*.spec.ts` |

The owner is the module whose code or configuration **decides** the behaviour, not the modules whose
surfaces show it: one rule has one owner, even when it is checked on five surfaces.

A module's tests run **only while the module is enabled** in `app/etc/config.php`. A test in `e2e/tests/`
runs regardless, so it must not depend on one module's behaviour.

A module test imports the framework from `@hryvinskyi/magento2-e2e` only (`test`, `expect`, the tag
constants, the `Page`/`Locator` types), plus files in its own `Test/E2e/`. Never `@playwright/test`
directly (a second copy of the runner would load), never another module's `Test/E2e/`. Knowledge that only
one module's rule needs lives in that module's `Test/E2e/`, not in the project's shared code.

Fixtures: `storefront` is the store view chosen with `test.use({ storeCode: 'fr' })` (the project's default
otherwise); `storefrontOf(code)` gives any other store on the same page, which is how a rule is compared
between two stores in one test.

```ts
import { expect, READONLY_TAG, test } from '@hryvinskyi/magento2-e2e';

test.use({ storeCode: 'fr' });

test('the rule, in business words', { tag: READONLY_TAG }, async ({ storefront, page }) => {
    await storefront.open('offers');   // relative to the store's base URL, no leading slash
    // ...
});
```

## Safety tags - production is a real shop

Every test declares **exactly one** safety tag. The `safetyGuard` fixture fails a test that has none or
two, and skips a test whose tag may not run in the environment. The guard is a fixture, not a `--grep`, so
no command-line flag can bypass it. A fixture cannot reach a `beforeAll` hook, which runs before the guard,
also when every test of the file is then skipped: nothing that writes belongs in one.

| Tag | May do | Runs on production |
|---|---|---|
| `@readonly` | open pages, read | yes |
| `@cart` | create a **guest** cart, walk the checkout up to the pay button | yes |
| `@mutating` | anything that persists: place an order, register or log in a customer, subscribe to a newsletter, submit a form, write a review, redeem a coupon | never |
| `@order` | place a test order the shop recognises, and abandon it; only in a project that adds `testOrderSafetyRule` to its `safetyTags` | up to the payment window, with the project's `productionWriteGuard` |
| `@admin` | sign in to the admin and work there; only in a project that declares `admin` | only where the project says `admin: { onProduction: true }` |

A project may add tags of its own, each with its rule. Never press the pay button outside a `@mutating`
test: it places a real order with a real payment provider. A `@mutating` test that presses it stops the
order placement in the browser first, so nothing is created even where the database carries live payment
keys. The one exception is an `@order` test: it presses the button only after `signTestOrderPlacements()`,
for a cart it has recorded with `testOrders.carts.record()`. The package has no page object that presses it
for the test, and a placement nobody signed is stopped in the browser and fails the test. The file of an
`@order` test sets `test.use({ trace: 'off' })` at its top level, or the fixture refuses the test. The test
checks that `testOrders.carts.abandon()` answers `abandoned`: `still-open` means the shop could not end
the order, which stays in the shop and fails the test at its end. Never type a real
person's e-mail address anywhere; test addresses use a domain that cannot deliver
(`e2e+<something>@shop.test`).

`@search` marks a test that needs the shop's search service; it is skipped where the run says
`E2E_SEARCH_SERVICE=off`. `@mobile` also runs a test on the phone project; `@mobile-only` runs it only
there. Keep `@smoke`, where a project uses it for the post-deployment run, for rules whose breakage is
urgent and tests that finish in well under a minute.

## Tests in the admin

A rule the admin sets (a configuration field, a grid, a save) is checked in the admin with the `admin`
fixture; what the setting does to the storefront is checked on the storefront, in the same test when one
drives the other.

```ts
import { ADMIN_TAG, expect, test } from '@hryvinskyi/magento2-e2e';

test.use({ trace: 'off' });                    // a trace would keep the session cookie: the fixture refuses one

test('the rule, in business words', { tag: ADMIN_TAG }, async ({ admin, storefront }) => {
    await admin.openMenuItem('menu-magento-catalog-catalog-products');   // the item's data-ui-id
    await admin.settled();                                               // the grid's mask gone
    await admin.follow(admin.page.getByRole('link', { name: 'Edit' }).first());
    expect(admin.route()).toMatch(/^catalog\/product\/edit\/id\/\d+$/);   // without the secret key
    await admin.page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(admin.messages('success')).toBeVisible();
    await storefront.open();                                             // the storefront, without the admin's session
});
```

- **Never type an admin address.** With secret keys on, Magento sends a typed address to the dashboard. Open
  `admin.open()` (the start page), `admin.openMenuItem(id)` with the item's `data-ui-id`, or
  `admin.follow(link)` for a link the page shows; assert on `admin.route()`, never on the URL.
- **Read the menu id on the real page** (`[data-ui-id^="menu-"]` in the admin menu); an item that only opens a
  submenu has no page.
- **A request of the test's own** through the admin's session carries `form_key: await admin.formKey()`.
- **`settled()` after every click that loads data**, before an assertion: a grid or a form draws a mask while
  it loads.
- The admin user and password come from `E2E_ADMIN_USER` and `E2E_ADMIN_PASSWORD`, never from the test or a
  page object, and never appear in a test title, an evidence name or a log line.
- A sign-in failure names its cause (credentials, CAPTCHA, two-factor authentication) and is not retried in
  that worker. "The admin session ended" means a second worker signed in as the same user: the environment
  needs `admin/security/admin_account_sharing` on, or the admin tests run in one worker.
- What the test saves stays saved: an `@admin` test that changes configuration restores it in the same test,
  and never runs where it may not write.

## A test that cannot fail is worse than no test

The expensive mistakes here are all false greens.

- **An absence assertion passes the moment it is evaluated.** `toHaveCount(0)` on content that arrives
  asynchronously is green before the content exists. Wait for the thing that proves the page has finished:
  the widget that loads last, a line in the mini cart, the e-mail field of the checkout, anything
  Knockout renders.
- **Collapsed is invisible.** An accordion, a tab or a hover hides what a probe looks for; open it first.
- **Held-back assets.** A page that defers stylesheets or scripts until the first interaction is not the
  page a visitor sees: call `storefront.applyDeferredStylesheets()` before an assertion about how something
  looks, and `storefront.runDeferredScripts()` before one about whether a script ran.
- **Every "shows none" needs a "shows it" control.** Keep one test that proves the probe still recognises
  the thing where it *is* allowed. When the markup changes, the control goes red instead of the rule going
  silently blind.
- **A rule that hides something is only as good as its list of surfaces.** A probe names the markup of
  every surface that draws the data; a surface that draws it with new markup is invisible to it until it is
  added.
- **Mutation check before you trust a new negative test.** Point the forbidden store at one where the
  thing is allowed and confirm the test goes red on every surface:

  ```
  E2E_ENV=production E2E_BASE_URL_FR=https://www.example.com/ npx playwright test <the module's Test/E2e>
  ```

  A surface that stays green under mutation is one the probe cannot see: fix the probe.
- **Use `expect.soft` when one flow checks several surfaces**, so one run names every leaking surface, not
  only the first.
- **A store that hides something cannot tell you which products have it.** Take the products from a store
  where it is shown, then open the same product in the other store.
- **Never hard-code a product, a SKU or a price.** The catalog changes. Find products at run time from a
  listing, and record per-store paths with `perStoreValue(name, table)`, which `E2E_<NAME>_<STORE CODE>`
  can replace in a copy of the shop without the live URL rewrites.

## Waiting without sleeps

No `waitForTimeout` and no `networkidle`: third-party widgets keep the network busy forever. Wait for the
element or the state the assertion is about (`expect(locator).toBeVisible()`, `expect.poll`,
`expect(...).toPass()`), and give a slow control its own timeout rather than the whole test a longer one.
Never build a URL by string concatenation: `storefront.url(path)` keeps a store below a path working.

## Running

```
cd e2e
npm ci && npx playwright install chromium    # once
cp .env.example .env                          # once; set what the environment needs

E2E_ENV=local npx playwright test             # a local copy
E2E_ENV=production npx playwright test        # the live shop: only tests whose tag allows it run
npx playwright test --project=desktop-modules # every enabled module's tests
npx playwright test --ui                      # pick locators, watch, time-travel
npx playwright show-trace test-results/<dir>/trace.zip   # after a failure
```

Before any test the run asks the default store's home page whether it answers, and stops with one message
if it does not. A run that needs no site (a Node-only spec that loads an AMD module or the shop's jQuery)
sets `E2E_PREFLIGHT=off`.

## Diagnosing a red test

Read `test-results/<test>/error-context.md` (the page snapshot at the failure) and look at the failure
screenshot before changing anything. Then decide which of three it is, and say which:

1. **The storefront is broken**: the test did its job. Report it with the screenshot; do not touch the
   test.
2. **The storefront changed on purpose**: update the page object, not the spec.
3. **The test was wrong** (a race, a product that vanished, an overlay): fix the cause in the page object
   or the fixtures. Never add a retry, a sleep or a `test.skip` to get to green, and never weaken an
   assertion.

A run refused by the safety guard is not a red test: read the message, it names the tag and the
environment.

## Labelling test traffic

The user agent of a run may end with a token (`E2E_USER_AGENT_SUFFIX`) so the traffic can be told apart in
logs and analytics. It is a label only. A user agent can be forged by anyone, so never make a bot filter,
a rate limit or a firewall rule exempt traffic because of it.

## Done means

- the rule is stated in the test title in business words;
- every surface from step 2 is covered, or named in the final message as not covered, and why;
- exactly one safety tag;
- the test was seen red (the bug reproduced, or the mutation check);
- the project's `typecheck` is clean and the suite was run against the environment the change is on;
- the test sits with the module that owns the rule, or in `e2e/tests/` when no module does;
- new selectors live in page objects, new storefront-wide facts in the project's shared data, facts only
  one module's rule needs in that module's `Test/E2e/`.

## Install into a project

Copy this directory to `.claude/skills/magento-e2e-test/` of the project (or to the user's skills
directory) and add the project's own facts below the last section: which page objects exist, which
overlays its fixtures handle, which markets differ.
