import path from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
});

export default [
    {
        ignores: [
            "**/node_modules/**",
            "**/dist/**",
            "**/output/**",
            "**/build/**",
            "**/static/**",
            "**/*.styl",
            "**/*.css",
        ],
    },
    ...compat.extends("trendmicro"),
    {
        files: ["**/*.js", "**/*.jsx", "**/*.ts", "**/*.tsx"],
        plugins: {
            react: reactPlugin,
            "react-hooks": reactHooksPlugin,
        },
        languageOptions: {
            parser: (await import("@babel/eslint-parser")).default,
            parserOptions: {
                requireConfigFile: false,
                babelOptions: {
                    presets: ["@babel/preset-react"],
                },
            },
            globals: {
                window: "readonly",
                document: "readonly",
                process: "readonly",
                __dirname: "readonly",
                __filename: "readonly",
                node: true,
                browser: true,
            },
        },
        settings: {
            react: {
                version: "detect",
            },
            "import/resolver": {
                webpack: {
                    config: {
                        resolve: {
                            modules: [path.resolve(__dirname, "src"), "node_modules"],
                            extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
                        },
                    },
                },
            },
        },
        rules: {
            ...reactPlugin.configs.recommended.rules,
            ...reactHooksPlugin.configs.recommended.rules,
            "max-lines-per-function": [
                1,
                {
                    max: 512,
                    skipBlankLines: true,
                    skipComments: true,
                },
            ],
            "react/jsx-no-bind": [
                1,
                {
                    allowArrowFunctions: true,
                },
            ],
            "react/prefer-stateless-function": 0,
            "react/no-access-state-in-setstate": 0,
            "react/jsx-indent": 1,
            "react/prop-types": 0,
            "import/order": 0,
            "react/react-in-jsx-scope": "off", // Not needed in React 17+
        },
    },
];
