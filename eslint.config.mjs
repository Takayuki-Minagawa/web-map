import js from '@eslint/js';
import globals from 'globals';

export default [
    { ignores: ['node_modules/**', 'playwright-report/**', 'test-results/**', '_site/**'] },
    js.configs.recommended,
    {
        files: ['*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                ...globals.browser,
                module: 'readonly',
                L: 'readonly',
                html2canvas: 'readonly',
                WebMapData: 'readonly',
                WebMapServices: 'readonly'
            }
        }
    },
    {
        files: ['playwright.config.js', 'tests/**/*.js', 'scripts/**/*.js'],
        languageOptions: {
            sourceType: 'commonjs',
            globals: { ...globals.node, ...globals.browser }
        }
    }
];
