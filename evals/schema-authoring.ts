/**
 * ---
 * purpose: Assess a schema drafted by an agent against a hand-written schema, including lint results and mutation markers.
 * ---
 */
import { lintSchema, type LintIssue } from '../packages/cli/src/lint.ts';
import { validateSchema, type Operation, type Schema } from '../packages/cli/src/schema.ts';

export type MutationMarker = { command: string; expected: boolean | 'unknown'; actual: boolean | 'unknown'; correct: boolean };
export type SchemaAssessment = {
  valid: boolean;
  validationError?: string;
  lint: { healthy: boolean; errors: number; warnings: number; issues: LintIssue[] };
  mutation: { correct: number; total: number; missing: number; wrong: number; markers: MutationMarker[] };
};

function leaves(operations: Operation[], parent: string[] = []): { command: string; operation: Operation }[] {
  return operations.flatMap(operation => {
    const path = [...parent, operation.name];
    return operation.subcommands?.length
      ? leaves(operation.subcommands, path)
      : [{ command: path.join(' '), operation }];
  });
}

const marker = (operation: Operation | undefined): boolean | 'unknown' => operation?.mutating ?? 'unknown';

/** Compare every hand-written command to its draft by its full command path. Extra draft commands remain visible in lint output. */
export function assessSchema(candidate: unknown, truth: Schema): SchemaAssessment {
  let schema: Schema;
  try {
    schema = validateSchema(candidate);
  } catch (error) {
    return {
      valid: false,
      validationError: error instanceof Error ? error.message : String(error),
      lint: { healthy: false, errors: 1, warnings: 0, issues: [] },
      mutation: { correct: 0, total: 0, missing: 0, wrong: 0, markers: [] },
    };
  }
  const issues = lintSchema(schema);
  const actual = new Map(leaves((schema.commands ?? schema.capabilities)!).map(item => [item.command, item.operation]));
  const markers = leaves((truth.commands ?? truth.capabilities)!).map(({ command, operation }) => {
    const expected = marker(operation);
    const found = marker(actual.get(command));
    return { command, expected, actual: found, correct: expected === found };
  });
  const missing = markers.filter(item => item.actual === 'unknown').length;
  return {
    valid: true,
    lint: { healthy: !issues.some(issue => issue.severity === 'error'), errors: issues.filter(issue => issue.severity === 'error').length, warnings: issues.filter(issue => issue.severity === 'warning').length, issues },
    mutation: { correct: markers.filter(item => item.correct).length, total: markers.length, missing, wrong: markers.length - missing - markers.filter(item => item.correct).length, markers },
  };
}
