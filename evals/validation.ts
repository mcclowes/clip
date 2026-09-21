/**
 * ---
 * purpose: Summarize registry eval runs into the validation record stored on a registry entry.
 * ---
 */
import type { Validation } from '../packages/cli/src/registry.ts';

export type RegistryRow = {
  tool: string; condition: string; task: string; success: boolean;
  model: string; claudeVersion: string; toolVersion: string; sha256: string; harnessError?: string;
};

const single = (rows: RegistryRow[], key: 'model' | 'claudeVersion' | 'toolVersion') => {
  const values = [...new Set(rows.map(row => row[key]))];
  if (values.length !== 1) throw new Error(`Runs span more than one ${key}: ${values.join(', ')}. Validate from one run.`);
  return values[0]!;
};

/** Validated means every run with the schema passed. The baseline is recorded beside it, since a schema can pass and still add nothing. */
export function summarizeValidation(rows: RegistryRow[], context: { sha256: string; clipVersion: string; date: string }): Validation {
  const withSchema = rows.filter(row => row.condition === 'cli-clip');
  const baseline = rows.filter(row => row.condition === 'cli-bare');
  if (!withSchema.length) throw new Error('There are no cli-clip runs to validate from.');
  if (rows.some(row => row.sha256 !== context.sha256)) throw new Error('The schema has changed since these runs. Rerun before recording.');
  const passed = withSchema.filter(row => row.success && !row.harnessError).length;
  return {
    validated: passed === withSchema.length, sha256: context.sha256, date: context.date,
    model: single(rows, 'model'), claudeVersion: single(rows, 'claudeVersion'), clipVersion: context.clipVersion, toolVersion: single(rows, 'toolVersion'),
    passed, runs: withSchema.length, baselinePassed: baseline.filter(row => row.success && !row.harnessError).length, baselineRuns: baseline.length,
  };
}
