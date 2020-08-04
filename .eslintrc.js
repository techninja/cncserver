module.exports = {
  parser: 'babel-eslint',
  extends: 'airbnb-base',
  rules: {
    'no-restricted-syntax': 'off',
    'no-underscore-dangle': 'off',
    'no-plusplus': 'off',
    'max-len': [
      'error',
      {
        code: 90,
      },
    ],
    'comma-dangle': [
      'error',
      {
        exports: 'never',
        functions: 'never',
        arrays: 'always-multiline',
        objects: 'always-multiline',
      },
    ],
    'class-methods-use-this': 'off',
    'no-console': 'off',
    'no-multi-str': 'off',
  },
};
