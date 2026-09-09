import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import entries from '../../data/registry.json';

type ToolId = (typeof entries)[number]['id'];

export default function ToolDetail({id}: {id: ToolId}): React.JSX.Element {
  const entry = entries.find((item) => item.id === id)!;
  const schema = entry.capabilities;
  const operations = schema.commands ?? schema.capabilities ?? [];

  return (
    <Layout title={`${entry.name} capabilities`} description={entry.purpose}>
      <main className="shell">
        <header className="page-heading"><Link to="/tools">← All tools</Link><h1>{entry.name}</h1><p>{entry.purpose}</p><div className="detail-meta"><span>{entry.category}</span><span>Schema v{entry.version}</span><span>Maintained by {entry.maintainer}</span></div></header>
        <div className="docs-grid">
          <aside className="docs-nav"><a href="#install">Install schema</a><a href="#capabilities">Capabilities</a><a href={`/registry/${entry.schema}`} download>Download JSON ↗</a><a href={entry.documentation}>Upstream docs ↗</a></aside>
          <article className="prose">
            <section id="install"><h2>Give your agents the context</h2><p>Install <a href={entry.upstream}>{entry.name}</a> first. This command installs its capability description and registers your local executable. It doesn't install or run the tool.</p><pre><code>{`clip registry add ${entry.id} --purpose "${entry.purpose}"\nclip sync`}</code></pre><p>Coverage: {entry.coverage}. This is a partial community description, not a claim of full CLI Spec conformance. Missing mutation markers mean unknown.</p></section>
            <section id="capabilities"><p className="eyebrow">what's described</p><h2>Capabilities</h2>{operations.map((operation) => <div className="command" key={operation.name}><span className="badge">{'mutating' in operation && operation.mutating === false ? 'Read operation' : 'Mutation status unknown'}</span><h3>{entry.executable} {operation.name}</h3><p>{operation.description}</p>{operation.examples?.map((example) => <pre key={example}><code>{example}</code></pre>)}</div>)}</section>
            <section><h2>Inspect the source</h2><p>Review the schema's arguments and output fields before use. Community descriptions provide context, not authorization.</p><details><summary>Full capability document</summary><pre><code>{JSON.stringify(schema, null, 2)}</code></pre></details><p><a href={`https://github.com/mcclowes/clip/blob/main/registry/${entry.schema}`}>View source and propose an update ↗</a></p><p className="tool-meta hash">SHA-256: {entry.sha256}</p></section>
          </article>
        </div>
      </main>
    </Layout>
  );
}
