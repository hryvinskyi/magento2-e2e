import { defineMagentoConfig } from '@hryvinskyi/magento2-e2e';
import { project } from './src/project';

export default defineMagentoConfig({
    project,
    configDir: __dirname,
});
