import securityRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    files: ['firestore.rules'],
    plugins: {
      '@firebase/security-rules': securityRulesPlugin,
    },
    languageOptions: {
      parser: securityRulesPlugin.parser,
    },
    rules: {
      ...securityRulesPlugin.configs.recommended.rules,
    },
  },
];
