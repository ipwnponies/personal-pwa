'use strict';

module.exports = {
  // Next.js (pages router) treats every .js/.jsx file directly under pages/
  // as a route and requires a default-exported React component. A file with
  // only named exports is valid JS/ESLint-wise but fails `next build` at
  // "Collecting page data" time, well after lint and tests pass. This rule
  // catches it at lint time instead.
  'require-page-default-export': {
    meta: {
      type: 'problem',
      docs: {
        description: 'require a default export in every file under pages/ (Next.js page router requirement)',
      },
      schema: [],
      messages: {
        missingDefaultExport:
          'Next.js treats every file under pages/ as a route and requires a default export. ' +
          'If this file is not a page (e.g. a shared context/hook/util), move it out of pages/ (e.g. into components/ or lib/).',
      },
    },
    create(context) {
      let hasDefaultExport = false;

      return {
        ExportDefaultDeclaration() {
          hasDefaultExport = true;
        },
        'Program:exit'(node) {
          if (!hasDefaultExport) {
            context.report({ node, messageId: 'missingDefaultExport' });
          }
        },
      };
    },
  },
};
