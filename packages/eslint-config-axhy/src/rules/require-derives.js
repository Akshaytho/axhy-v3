/**
 * axhy/require-derives — Custom ESLint rule
 *
 * Every exported symbol (function, class, type, const) must have a JSDoc
 * comment containing `@derives(ADR-NNNN)` or `@derives(master-plan §X.Y)`.
 *
 * Why: lineage. Every line of code traces back to its originating decision.
 * Without this, code becomes "haunted" at scale — nobody remembers why.
 *
 * @derives(ADR-0019)
 */

const DERIVES_RE = /@derives\((?:ADR-\d{4}|master-plan §[A-Z0-9.]+)\)/;

const EXEMPT_FILE_PATTERNS = [
  /\.test\.ts$/,
  /\.spec\.ts$/,
  /__tests__\//,
  /\/dist\//,
  /\/\.next\//,
  /\/generated\//,
  /\.d\.ts$/,
];

function isExempt(filename) {
  return EXEMPT_FILE_PATTERNS.some((re) => re.test(filename));
}

function getLeadingComments(sourceCode, node) {
  return sourceCode.getCommentsBefore(node) ?? [];
}

function commentsContainDerives(comments) {
  return comments.some((c) => DERIVES_RE.test(c.value));
}

function declarationName(decl) {
  if (!decl) return null;
  if (decl.type === 'FunctionDeclaration') return decl.id?.name ?? null;
  if (decl.type === 'ClassDeclaration') return decl.id?.name ?? null;
  if (decl.type === 'TSInterfaceDeclaration') return decl.id.name;
  if (decl.type === 'TSTypeAliasDeclaration') return decl.id.name;
  if (decl.type === 'TSEnumDeclaration') return decl.id.name;
  if (decl.type === 'VariableDeclaration') {
    const first = decl.declarations[0];
    return first?.id?.type === 'Identifier' ? first.id.name : null;
  }
  return null;
}

function declarationKind(decl) {
  if (!decl) return 'symbol';
  switch (decl.type) {
    case 'FunctionDeclaration':
      return 'function';
    case 'ClassDeclaration':
      return 'class';
    case 'TSInterfaceDeclaration':
      return 'interface';
    case 'TSTypeAliasDeclaration':
      return 'type';
    case 'TSEnumDeclaration':
      return 'enum';
    case 'VariableDeclaration':
      return 'variable';
    default:
      return 'symbol';
  }
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require @derives(ADR-NNNN) or @derives(master-plan §X.Y) JSDoc on exported symbols',
    },
    messages: {
      missing:
        'Exported {{kind}} "{{name}}" must have a JSDoc comment containing @derives(ADR-NNNN) or @derives(master-plan §X.Y). This rule maintains lineage from code back to its originating decision.',
    },
    schema: [],
  },
  create(context) {
    const filename = context.getFilename?.() ?? context.filename ?? '';
    if (isExempt(filename)) return {};

    const sourceCode = context.getSourceCode?.() ?? context.sourceCode;

    function check(node) {
      // For `export const X = ...` etc., the leading comments may be on the
      // ExportNamedDeclaration itself OR on the inner declaration. Check both.
      const outerComments = getLeadingComments(sourceCode, node);
      const innerComments = node.declaration
        ? getLeadingComments(sourceCode, node.declaration)
        : [];
      const allComments = [...outerComments, ...innerComments];

      if (commentsContainDerives(allComments)) return;

      const decl = node.declaration;
      const name = declarationName(decl);
      const kind = declarationKind(decl);

      // Skip re-exports without a decl (e.g. `export { X } from './y'`)
      if (!decl) return;

      // Skip when the file already has a top-of-file @derives comment.
      // The convention: a file-level @derives in the FIRST comment block
      // covers all exports in that file.
      const allFileComments = sourceCode.getAllComments();
      const firstComment = allFileComments[0];
      if (firstComment && DERIVES_RE.test(firstComment.value)) return;

      context.report({
        node,
        messageId: 'missing',
        data: { kind, name: name ?? '<anonymous>' },
      });
    }

    return {
      ExportNamedDeclaration: check,
      ExportDefaultDeclaration: check,
    };
  },
};
