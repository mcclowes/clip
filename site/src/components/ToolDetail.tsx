import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import entries from '../../data/registry.json';

type ToolId = (typeof entries)[number]['id'];
type Validation = {validated: boolean; sha256: string; date: string; model: string; claudeVersion: string; clipVersion: string; toolVersion: string; passed: number; runs: number; baselinePassed: number; baselineRuns: number};

/** A validation holds only for the schema digest it ran against, matching `clip registry search`. */
export function validationOf(entry: (typeof entries)[number]): {status: 'validated' | 'failed' | 'stale' | 'unvalidated'; record?: Validation} {
  const record = 'validation' in entry ? (entry.validation as Validation) : undefined;
  if (!record) return {status: 'unvalidated'};
  if (record.sha256 !== entry.sha256) return {status: 'stale', record};
  return {status: record.validated ? 'validated' : 'failed', record};
}

function ValidationSection({entry}: {entry: (typeof entries)[number]}): React.JSX.Element {
  const {status, record} = validationOf(entry);
  const run = record && <p>An agent ({record.model}, Claude Code {record.claudeVersion}) completed {record.passed} of {record.runs} read-only tasks with this schema and {record.baselinePassed} of {record.baselineRuns} without it, against {record.toolVersion}, on {record.date}. A schema can pass without adding anything the model didn't already know, so compare the two.</p>;
  const summary = {
    validated: 'This schema passed the repository evals against the real tool.',
    failed: 'This schema did not pass every eval run. Its gotchas may help.',
    stale: 'The schema has changed since its last eval run, so the result below no longer applies.',
    unvalidated: "This schema hasn't been run against its tool by an agent yet.",
  }[status];
  return <section id="validation"><h2>Agent validation</h2><p>{summary}</p>{run}<p><a href="https://github.com/mcclowes/clip/blob/main/evals/README.md#registry-validation">How validation works ↗</a></p></section>;
}

export default function ToolDetail({id}: {id: ToolId}): React.JSX.Element {
  const entry = entries.find((item) => item.id === id)!;
  const schema = entry.capabilities;
  const operations = schema.commands ?? schema.capabilities ?? [];

  return (
    <Layout title={`${entry.name} capabilities`} description={entry.purpose}>
      <main className="shell">
        <header className="page-heading"><Link to="/tools">← All tools</Link><h1>{entry.name}</h1><p>{entry.purpose}</p><div className="detail-meta"><span>{entry.category}</span><span>Schema v{entry.version}</span><span>Maintained by {entry.maintainer}</span>{validationOf(entry).status === 'validated' && <span>Agent-validated</span>}</div></header>
        <div className="docs-grid">
          <aside className="docs-nav"><a href="#install">Install schema</a><a href="#capabilities">Capabilities</a><a href="#validation">Agent validation</a><a href={`/registry/${entry.schema}`} download>Download JSON ↗</a><a href={entry.documentation}>Upstream docs ↗</a></aside>
          <article className="prose">
            <section id="install"><h2>Give your agents the context</h2><p>Install <a href={entry.upstream}>{entry.name}</a> first. This command installs its capability description and registers your local executable. It doesn't install or run the tool.</p><pre><code>{`clip registry add ${entry.id} --purpose "${entry.purpose}"\nclip sync`}</code></pre><p>Coverage: {entry.coverage}. This is a partial community description, not a claim of full CLI Spec conformance. Missing mutation markers mean unknown.</p></section>
            <ValidationSection entry={entry} />
            <section id="capabilities"><p className="eyebrow">what's described</p><h2>Capabilities</h2>{operations.map((operation) => <div className="command" key={operation.name}><span className="badge">{'mutating' in operation && operation.mutating === false ? 'Read operation' : 'Mutation status unknown'}</span><h3>{entry.executable} {operation.name}</h3><p>{operation.description}</p>{operation.examples?.map((example) => <pre key={example}><code>{example}</code></pre>)}</div>)}</section>
            <section><h2>Inspect the source</h2><p>Review the schema's arguments and output fields before use. Community descriptions provide context, not authorization.</p><details><summary>Full capability document</summary><pre><code>{JSON.stringify(schema, null, 2)}</code></pre></details><p><a href={`https://github.com/mcclowes/clip/blob/main/registry/${entry.schema}`}>View source and propose an update ↗</a></p><p className="tool-meta hash">SHA-256: {entry.sha256}</p></section>
          </article>
        </div>
      </main>
    </Layout>
  );
}
