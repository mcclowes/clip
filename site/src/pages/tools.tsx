import {useMemo, useState} from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import entries from '../../data/registry.json';

export default function Tools(): React.JSX.Element {
  const [query, setQuery] = useState('');
  const items = useMemo(() => entries.filter((item) => `${item.name} ${item.id} ${item.purpose} ${item.category}`.toLowerCase().includes(query.toLowerCase())), [query]);

  return (
    <Layout title="CLI directory" description="Browse community capability schemas for command-line tools.">
      <main className="shell">
        <header className="page-heading"><p className="eyebrow">the community directory</p><h1>Good tools.<br />Shared knowledge.</h1><p>Capability descriptions for the CLIs you use. Find a tool, inspect its schema, and give your agents the context to use it.</p></header>
        <div className="tools-toolbar"><input type="search" aria-label="Search CLI tools" placeholder="Search tools, capabilities, or categories…" value={query} onChange={(event) => setQuery(event.target.value)} /><span className="count" aria-live="polite">{items.length} {items.length === 1 ? 'tool' : 'tools'}</span></div>
        <div className="tool-list">
          {items.length ? items.map((item) => (
            <Link className="tool-row" to={`/tools/${item.id}`} key={item.id}>
              <span className="tool-icon" aria-hidden="true">{item.id === 'git' ? '±' : item.id === 'gh' ? 'gh' : '{}'}</span>
              <div><h2>{item.name}</h2><p>{item.purpose}</p></div>
              <div className="tool-meta">{item.category}<br />Schema v{item.version}</div><span aria-hidden="true">↗</span>
            </Link>
          )) : <p className="empty">No tools match “{query}”. Try another name or contribute a schema.</p>}
        </div>
        <section className="callout"><div><p className="eyebrow">build in the open</p><h2>Your tool belongs here.</h2><p>Write a schema, document its scope, and contribute it on GitHub.</p></div><a className="primary-link" href="https://github.com/mcclowes/clip/blob/main/CONTRIBUTING.md">Contribute a schema ↗</a></section>
      </main>
    </Layout>
  );
}
