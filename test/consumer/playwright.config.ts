import { defineMagentoConfig } from '@hryvinskyi/magento2-e2e';
import { project } from './project';

/** The page server's port; each run is given a free one. */
const port = process.env.E2E_CONSUMER_PORT?.trim() ?? '';

if (port === '') {
    throw new Error('E2E_CONSUMER_PORT must name a free port for the page server.');
}

export default defineMagentoConfig({
    project,
    configDir: __dirname,
    playwright: {
        webServer: {
            command: 'node server.mjs',
            cwd: __dirname,
            url: `http://127.0.0.1:${port}/ready`,
            reuseExistingServer: false,
            timeout: 30_000,
        },
    },
});
