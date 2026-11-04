import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
    { ignores: ['dist/', 'node_modules/', 'test-results/', 'playwright-report/', 'test/consumer/magento/vendor/other/'] },
    eslint.configs.recommended,
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: { allowDefaultProject: ['eslint.config.mjs'] },
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            '@typescript-eslint/consistent-type-imports': 'error',
            // `Register` is empty on purpose: it is the declaration-merging point a project augments
            // with its own stores and environments. Every other empty object type stays an error.
            '@typescript-eslint/no-empty-object-type': ['error', { allowWithName: '^Register$' }],
        },
    },
    {
        // The starter project is type-checked against the package's sources, as its own tsconfig maps
        // the package to node_modules, where it is not installed here.
        files: ['templates/project/**/*.ts'],
        languageOptions: {
            parserOptions: { projectService: false, project: ['./tsconfig.templates.json'] },
        },
    },
    {
        // A plain JavaScript configuration file for a tool this package does not install: there are no
        // types to check it against.
        files: ['templates/project/allurerc.mjs'],
        extends: [tseslint.configs.disableTypeChecked],
    },
);
