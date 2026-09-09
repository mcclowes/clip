import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import entries from "@/data/registry.json";
export function generateStaticParams() {
  return entries.map((entry) => ({ id: entry.id }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const entry = entries.find((item) => item.id === id);
  if (!entry) return { title: "Tool not found" };
  return {
    title: `${entry.name} capabilities`,
    description: entry.purpose,
    openGraph: { title: `${entry.name} capabilities`, description: entry.purpose, images: [] },
    twitter: {
      title: `${entry.name} capabilities`,
      description: entry.purpose,
      images: [],
      card: "summary",
    },
  };
}
export default async function Tool({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entry = entries.find((item) => item.id === id);
  if (!entry) notFound();
  const schema = entry.capabilities;
  const operations = schema.commands ?? schema.capabilities ?? [];
  return (
    <main className="shell">
      <div className="page-heading">
        <Link href="/tools">← All tools</Link>
        <h1>{entry.name}</h1>
        <p>{entry.purpose}</p>
        <div className="detail-meta">
          <span>{entry.category}</span>
          <span>Schema v{entry.version}</span>
          <span>Maintained by {entry.maintainer}</span>
        </div>
      </div>
      <div className="docs-grid">
        <aside className="docs-nav">
          <a href="#install">Install schema</a>
          <a href="#capabilities">Capabilities</a>
          <a href={`/registry/${entry.schema}`} download>
            Download JSON ↗
          </a>
          <a href={entry.documentation}>Upstream docs ↗</a>
        </aside>
        <article className="prose">
          <section id="install">
            <h2>Give your agents the context</h2>
            <p>
              Install <a href={entry.upstream}>{entry.name}</a> first. This command installs its
              capability description and registers your local executable. It doesn’t install or run
              the tool.
            </p>
            <pre>
              <code>{`clip registry install ${entry.id} --purpose "${entry.purpose}"\nclip sync`}</code>
            </pre>
            <p>
              Coverage: {entry.coverage}. This is a partial community description, not a claim of
              full CLI Spec conformance. Missing mutation markers mean unknown.
            </p>
          </section>
          <section id="capabilities">
            <p className="eyebrow">What’s described</p>
            <h2>Capabilities</h2>
            {operations.map((operation) => (
              <div className="command" key={operation.name}>
                <span className="badge">
                  {"mutating" in operation && operation.mutating === false
                    ? "Read operation"
                    : "Mutation status unknown"}
                </span>
                <h3>
                  {entry.executable} {operation.name}
                </h3>
                <p>{operation.description}</p>
                {operation.examples?.map((example) => (
                  <pre key={example}>
                    <code>{example}</code>
                  </pre>
                ))}
              </div>
            ))}
          </section>
          <section>
            <h2>Inspect the source</h2>
            <p>
              Review the schema’s arguments and output fields before use. Community descriptions
              provide context, not authorization.
            </p>
            <details>
              <summary>Full capability document</summary>
              <pre>
                <code>{JSON.stringify(schema, null, 2)}</code>
              </pre>
            </details>
            <p>
              <a href={`https://github.com/mcclowes/clip/blob/main/registry/${entry.schema}`}>
                View source and propose an update ↗
              </a>
            </p>
            <p className="tool-meta" style={{ overflowWrap: "anywhere" }}>
              SHA-256: {entry.sha256}
            </p>
          </section>
        </article>
      </div>
    </main>
  );
}
