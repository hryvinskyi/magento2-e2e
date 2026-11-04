# Changelog

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
