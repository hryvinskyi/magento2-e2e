import process from 'node:process';
import { defineConfig } from 'allure';

const name = process.env.E2E_REPORT_NAME || 'Storefront checks';

/**
 * The report the shop's owners read after a deployment and each night. Built in the workflow from
 * `allure-results/` once `magento-e2e strip-traces` has run; `allure-history/history.jsonl` is restored
 * from the CI cache before the report and saved after it, so each report shows the trend.
 */
export default defineConfig({
    name,
    output: './allure-report',
    historyPath: './allure-history/history.jsonl',
    historyLimit: 60,
    plugins: {
        awesome: {
            options: {
                reportName: name,
                reportLanguage: 'en',
                singleFile: false,
            },
        },
    },
});
