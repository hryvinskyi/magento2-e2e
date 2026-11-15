# Changelog

## 1.3.0

- The admin: `admin` in `defineProject`, and `adminUrl` per environment for where the admin is. `defineProject()`
  refuses an admin no environment has an address for, an `adminUrl` in a project without `admin`, the live shop's
  `adminUrl` while `@admin` may not run there, and `@admin` among `safetyTags`.
- The `@admin` safety tag comes with `admin`. A test carrying it is skipped where the environment has no `adminUrl`,
  without `E2E_ADMIN_USER` and `E2E_ADMIN_PASSWORD`, and on a run that targets the live shop unless the project says
  `admin: { onProduction: true }`.
- The `admin` fixture: an `Admin` on a page of its own context, signed in with the worker's session. Only an
  `@admin` test with its trace off may ask for it; any other fails before anything reaches the shop.
- The `adminSession` worker fixture signs in once per worker, when its first test asks, and fails with one message
  for wrong credentials, a CAPTCHA, two-factor authentication or a sign-in handed to another site. A failed sign-in
  is not tried again in that worker. The credentials appear in no message and no step of the report.
- `Admin.open()`, `openMenuItem(id)` and `follow(link)` open pages that work whether the shop puts secret keys in
  its admin addresses or not; `route()` and `adminRouteOf()` read an address's route without the key. A page that
  shows the sign-in form fails the test, saying why sessions end. `messages(kind)`, `settled()` and `formKey()`.
- `Environment.adminUrl()` and `adminCredentials()`.
- The starter project holds the admin's lines, commented, and `.env.example` the two variables.
- The preflight opens the browser on the channel the config's `use` names, such as `channel: 'chrome'`, instead of
  always Playwright's own Chromium, which a project on the installed Chrome may not have downloaded. Without a
  channel nothing changes.

## 1.2.0

- A project declares the addresses its checkouts place a cart at: `testOrderPlacements` in `defineProject`,
  a list of `PlacementRoute`, by default `[GUEST_PAYMENT_INFORMATION]`, Magento's own checkout. A route says what
  is stopped, which cart a write places, and what the shop's accepted answer means. A placement is signed only
  when a route names the test's cart, and every other write to a route's address is stopped. The stock addresses
  and GraphQL placements stay stopped whatever a project declares.
- **Type change:** `PlacedTestOrder.orderId` is now `string | null`. It is null for a placement that creates its
  order after payment; `placedOrder()` still waits for the way to payment.
- An order that ends `closed` counts as ended: `abandon()` answers `abandoned`, as for `canceled`.
- `TestOrderPlacementTerms.routes`, `PlacementVerdict`'s `sign` names the route, and `stopUnsignedPlacements()` takes
  the routes. The reason a write is refused no longer says "guest cart".
- The browser as the only client: `shopClient: 'browser'` in `defineProject`, for a shop whose firewall answers only
  a browser or a machine where Node cannot reach the address. The default, `'runner'`, changes nothing. The signed
  placement is then the browser's own request with the proof added (`TestOrderPlacementTerms.client`), and the REST
  calls come from a page of the browser, `BrowserShopRequests`, opened at `/robots.txt` at the root of the store's
  origin. Anything there but 200 and `text/plain` fails before any proof is sent.
- With `'browser'`, a redirect of the placement is followed and the proof goes with it, which fails `placedOrder()`,
  and an answer's body lost to the page leaving resolves `placedOrder()` with `orderId` null, without asking the
  route. A placement that never gets an answer fails `placedOrder()` at its deadline with what the browser reported,
  not as a placement nobody saw, and the clean-up after the test waits for that deadline before it asks the shop to
  end the order.
- A placement on its way holds the clean-up after the test back with either client, so a test that times out while
  the shop is answering is not told `nothing-placed` before the order exists. The answer and its body share one
  deadline. A placement past that deadline cannot be called back, with either client; the shop's own clean-up ends
  an order it still places.

## 1.1.0

- Test orders, for a shop with the Magento module `hryvinskyi/magento2-test-order`: real orders the shop
  recognises and a test ends again. `@order` is opt-in through `testOrderSafetyRule` in `safetyTags`, and it
  needs `E2E_TEST_ORDER_SECRET`; on the live shop also `productionWriteGuard`.
- The `testOrders` fixture asks the shop whether it recognises the run before anything is placed, and
  abandons what the test left after it. Only a test tagged `@order` with its trace off may ask for it. An
  order the shop could not cancel comes back as `still-open` and fails the test: it stays in the shop.
- The `shopRequests` fixture is how `testOrders` reaches the shop. A project whose firewall refuses
  Playwright's API client overrides it with `test.extend`.
- `signTestOrderPlacements()` signs the one placement a test order may go through and stops every other REST
  and GraphQL placement, which rejects `placedOrder()`. A placement of an `@order` test that no signing route
  saw is stopped in the browser and fails the test at its end.
- `paysTestOrders` on an environment, `Environment.testOrderReach()`, `testOrderSecret()` and
  `storeBaseUrls()`. A run that reaches the live shop never pays.
- The workflow template gives each environment its own secret and keeps `@order` out of the nightly run.

## 1.0.2

- The preflight opens the page in Chromium, for the document alone, instead of asking with Node's HTTP
  client. A firewall that lets browsers through answered that client with 403, which stopped every run
  against such a site, and on a machine where Node may not reach a local address the check failed although
  the tests could run.

## 1.0.1

- The starter project holds `npmrc` (rename it to `.npmrc`) with `allow-git=root`, and the README says why:
  npm 12 refuses git dependencies unless a project opts in, so an install from the tag failed there.

## 1.0.0

First release.

- Store and environment model typed by the project through the `Register` augmentation: `defineProject`,
  `Environment`, `perStoreValue`.
- Safety tags (`@readonly`, `@cart`, `@mutating`) enforced by a fixture, with project-defined tags and
  refusals; `@search` for tests that need the search service.
- Module-owned tests: discovery of enabled `app/code` modules and Composer packages, one suite per group
  of real package paths.
- `defineMagentoConfig`: a project per browser and suite, reporters and evidence, the HTTP credentials
  and user agent of the run, and a preflight that stops a run against a site that does not answer.
- Storefront mechanics: `Storefront`, consent cookie, page guards, blocked requests, deferred assets, and
  an optional production write guard.
- Node loaders for AMD modules and the shop's jQuery; request, arrival and click helpers.
- `magento-e2e` CLI: `strip-traces`, `summary`, `report-gate`.
- Templates: starter project, GitHub Actions workflow, deployment hook.
- A Claude Code skill, `magento-e2e-test`, in `skill/`.
