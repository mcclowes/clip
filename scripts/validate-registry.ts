/**
 * ---
 * purpose: Validate bundled registry entries and lint their schemas with registry rules, failing on errors.
 * ---
 */
import { catalog, registrySchema } from '../packages/cli/src/registry.ts';
import { lintSchema } from '../packages/cli/src/lint.ts';

let failed = false;
for (const entry of catalog()) {
  const issues = lintSchema(registrySchema(entry), { registry: true });
  const errors = issues.filter(issue => issue.severity === 'error').length;
  console.log(`${entry.id}@${entry.version}: ${errors ? `${errors} errors` : 'valid'}${issues.length > errors ? `, ${issues.length - errors} warnings` : ''}`);
  for (const issue of issues) console.log(`  - ${issue.severity} ${issue.rule} ${issue.at}: ${issue.message}`);
  failed ||= errors > 0;
}
if (failed) {
  console.log('\nFix the errors above. The bounded example rule is under "Bounded examples" in CONTRIBUTING.md.');
  process.exitCode = 1;
}
