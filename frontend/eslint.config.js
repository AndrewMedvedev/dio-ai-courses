import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Слои FSD сверху вниз: слой может импортировать только те, что ниже него. */
const LAYERS = ['app', 'pages', 'widgets', 'features', 'entities', 'shared'];
const SLICED_LAYERS = ['pages', 'widgets', 'features', 'entities'];

const layerBoundaries = LAYERS.map((layer, index) => {
  const upperLayers = LAYERS.slice(0, index);
  const patterns = [
    {
      regex: '^@/(?:pages|widgets|features)/[^/]+/|^@/entities/[^/]+/(?!@x/)',
      message: 'Импортируйте слайс только через его public API (index.ts).',
    },
  ];

  if (upperLayers.length > 0) {
    patterns.push({
      regex: `^@/(${upperLayers.join('|')})(/|$)`,
      message: `Слой «${layer}» не может зависеть от вышележащих слоёв (${upperLayers.join(', ')}).`,
    });
  }

  if (SLICED_LAYERS.includes(layer)) {
    patterns.push({
      regex:
        layer === 'entities'
          ? '^@/entities/[^/]+(?:$|/(?!@x/))'
          : `^@/${layer}(/|$)`,
      message:
        'Слайсы одного слоя не зависят друг от друга. Внутри слайса используйте относительные импорты.',
      // Сущности могут ссылаться на типы друг друга (аналог @x-нотации FSD)
      allowTypeImports: layer === 'entities',
    });
  }

  return {
    files: [`src/${layer}/**/*.{ts,tsx}`],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', { patterns }],
    },
  };
});

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'docs', 'scripts', '**/*.local.*']),
  {
    files: ['*.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // React 18 без React Compiler: сохраняем порядок хуков и exhaustive-deps.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/use-memo': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { ignoreRestSiblings: true, argsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  ...layerBoundaries,
  prettier,
]);
