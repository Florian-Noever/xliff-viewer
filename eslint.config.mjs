import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';

const NODE_BUILTINS = [
    'fs', 'node:fs', 'fs/promises', 'node:fs/promises',
    'path', 'node:path', 'os', 'node:os',
    'child_process', 'node:child_process',
    'crypto', 'node:crypto', 'buffer', 'node:buffer',
    'stream', 'node:stream', 'util', 'node:util',
];

const BOUNDARY_MESSAGE =
    'src/extension and src/webview must not import each other. Shared code belongs in src/shared.';

export default tseslint.config(
    {
        ignores: ['out/**', 'public/**', 'node_modules/**', '.vscode-test/**', '.vscode-test-web/**'],
    },

    // ── Base rules — every TypeScript and Vue file ───────────────────────────
    {
        files: ['**/*.ts', '**/*.vue'],
        languageOptions: {
            parser: tseslint.parser,
            ecmaVersion: 2022,
            sourceType: 'module',
        },
        plugins: {
            '@typescript-eslint': tseslint.plugin,
        },
        rules: {
            // ── Formatting ───────────────────────────────────────────────────
            indent: ['warn', 4, { SwitchCase: 1 }],
            quotes: ['warn', 'single', { avoidEscape: true }],
            semi: 'warn',
            'brace-style': ['warn', '1tbs'],
            'linebreak-style': ['warn', 'unix'],
            curly: 'warn',

            // ── Core correctness ─────────────────────────────────────────────
            eqeqeq: ['warn', 'always', { null: 'ignore' }],
            'no-console': 'warn',
            'no-eval': 'error',
            'no-throw-literal': 'warn',
            'no-useless-return': 'warn',
            'no-var': 'error',
            'object-shorthand': 'warn',
            'prefer-const': 'warn',
            'prefer-template': 'warn',

            // ── Imports ──────────────────────────────────────────────────────
            '@typescript-eslint/naming-convention': ['warn', {
                selector: 'import',
                format: ['camelCase', 'PascalCase'],
            }],
            '@typescript-eslint/consistent-type-imports': ['warn', {
                prefer: 'type-imports',
                fixStyle: 'inline-type-imports',
            }],
            '@typescript-eslint/no-require-imports': 'error',

            // ── Class member conventions ─────────────────────────────────────
            '@typescript-eslint/explicit-member-accessibility': ['error', {
                accessibility: 'explicit',
            }],
            '@typescript-eslint/parameter-properties': ['error', {
                prefer: 'class-property',
            }],

            // ── Type definitions ─────────────────────────────────────────────
            '@typescript-eslint/no-wrapper-object-types': 'error',
            '@typescript-eslint/no-unsafe-function-type': 'error',
            '@typescript-eslint/no-empty-object-type': 'error',
            '@typescript-eslint/no-array-constructor': 'error',
            '@typescript-eslint/no-extra-non-null-assertion': 'error',
            '@typescript-eslint/no-misused-new': 'error',
            '@typescript-eslint/no-this-alias': 'warn',
            '@typescript-eslint/prefer-as-const': 'warn',
            '@typescript-eslint/no-unnecessary-type-constraint': 'warn',
            '@typescript-eslint/triple-slash-reference': 'off',
            '@typescript-eslint/no-duplicate-enum-values': 'error',

            // ── Code quality ─────────────────────────────────────────────────
            'no-shadow': 'off',
            '@typescript-eslint/no-shadow': 'warn',
            '@typescript-eslint/ban-ts-comment': ['warn', {
                'ts-expect-error': 'allow-with-description',
                'ts-ignore': 'allow-with-description',
            }],
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-non-null-assertion': 'warn',
            '@typescript-eslint/no-unused-vars': ['warn', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
            }],
        },
    },

    // ── Type-aware rules — source covered by a tsconfig ──────────────────────
    {
        files: ['src/**/*.ts', 'src/**/*.vue'],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
                // The project service does not recognise .vue without this.
                extraFileExtensions: ['.vue'],
            },
        },
        plugins: {
            '@typescript-eslint': tseslint.plugin,
        },
        rules: {
            // ── Error handling ───────────────────────────────────────────────
            '@typescript-eslint/only-throw-error': 'warn',
            '@typescript-eslint/use-unknown-in-catch-callback-variable': 'error',

            // ── Async / promise correctness ──────────────────────────────────
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-misused-promises': 'error',
            '@typescript-eslint/await-thenable': 'error',
            '@typescript-eslint/require-await': 'warn',
            '@typescript-eslint/return-await': 'error',

            // ── Type correctness ─────────────────────────────────────────────
            '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
            '@typescript-eslint/no-for-in-array': 'error',
            '@typescript-eslint/no-base-to-string': 'warn',
            '@typescript-eslint/no-unsafe-enum-comparison': 'warn',

            // ── Modern patterns ──────────────────────────────────────────────
            '@typescript-eslint/prefer-nullish-coalescing': 'warn',
            '@typescript-eslint/prefer-optional-chain': 'warn',
            '@typescript-eslint/prefer-includes': 'warn',
            '@typescript-eslint/prefer-string-starts-ends-with': 'warn',
        },
    },

    // ── Layer boundaries ─────────────────────────────────────────────────────
    {
        files: ['src/shared/**/*.ts'],
        rules: {
            'no-restricted-imports': ['error', {
                paths: [
                    ...NODE_BUILTINS.map(name => ({
                        name,
                        message: 'No node builtins in src/shared: it loads in the webview and the web host too. Use web-standard APIs instead.',
                    })),
                    {
                        name: 'vscode',
                        message: 'src/shared must not import vscode: the webview imports it too. Keep vscode calls in src/extension.',
                    },
                ],
                patterns: [
                    { group: ['**/extension/**', '**/webview/**'], message: 'src/shared may not depend on either runtime. Move what both need into src/shared.' },
                ],
            }],
        },
    },
    {
        files: ['src/extension/**/*.ts'],
        rules: {
            'no-restricted-imports': ['error', {
                paths: NODE_BUILTINS.map(name => ({
                    name,
                    message: 'No node builtins: the extension ships for the web host too. Use vscode.workspace.fs, Uri.joinPath, findFiles, TextEncoder/TextDecoder.',
                })),
                patterns: [
                    { group: ['**/webview/**'], message: BOUNDARY_MESSAGE },
                ],
            }],
        },
    },
    {
        files: ['src/extension/xliff/**/*.ts', 'src/extension/al/**/*.ts'],
        rules: {
            'no-restricted-imports': ['error', {
                paths: [
                    ...NODE_BUILTINS.map(name => ({ name, message: 'No node builtins in the data layer or the AL scanner: both ship for the web host too. Use web-standard APIs instead.' })),
                    {
                        name: 'vscode',
                        message: 'The data layer and the AL scanner must not import vscode, so they stay testable without mocks. Keep vscode calls outside src/extension/xliff and src/extension/al.',
                    },
                ],
                patterns: [
                    { group: ['**/webview/**'], message: BOUNDARY_MESSAGE },
                ],
            }],
        },
    },
    {
        files: ['src/webview/**/*.ts', 'src/webview/**/*.vue'],
        rules: {
            'no-restricted-imports': ['error', {
                paths: [
                    ...NODE_BUILTINS.map(name => ({ name, message: 'No node builtins in the webview: it runs in a browser.' })),
                    {
                        name: 'vscode',
                        message: 'The webview talks to the host only through src/webview/vscode.ts: import that instead.',
                    },
                ],
                patterns: [
                    { group: ['**/extension/**'], message: BOUNDARY_MESSAGE },
                ],
            }],
        },
    },

    // ── Vue SFCs ─────────────────────────────────────────────────────────────
    ...pluginVue.configs['flat/recommended'],
    {
        files: ['**/*.vue'],
        languageOptions: {
            parserOptions: {
                parser: tseslint.parser,
                ecmaVersion: 2022,
                sourceType: 'module',
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
                extraFileExtensions: ['.vue'],
            },
        },
        rules: {
            'vue/html-indent': ['warn', 4],
            'vue/max-attributes-per-line': ['warn', { singleline: { max: 5 }, multiline: { max: 1 } }],
            'vue/html-self-closing': ['warn', { html: { void: 'any', normal: 'always', component: 'always' } }],
            'vue/singleline-html-element-content-newline': 'off',
            'vue/no-v-html': 'off',
        },
    },
);
