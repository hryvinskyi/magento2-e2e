# Changelog

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
