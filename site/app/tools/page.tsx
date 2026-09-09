import type { Metadata } from "next";
import Directory from "./Directory";
export const metadata: Metadata = {
  title: "CLI directory",
  description: "Browse and install community capability schemas for command-line tools.",
};
export default function Tools() {
  return (
    <main className="shell">
      <div className="page-heading">
        <p className="eyebrow">The community directory</p>
        <h1>
          Good tools.
          <br />
          Shared knowledge.
        </h1>
        <p>
          Capability descriptions for the CLIs you use. Find a tool, inspect its schema, and give
          your agents the context to use it.
        </p>
      </div>
      <Directory />
      <section className="callout">
        <div>
          <p className="eyebrow">Build in the open</p>
          <h2>Your tool belongs here.</h2>
          <p>Write a schema, document its scope, and contribute it on GitHub.</p>
        </div>
        <a
          className="primary-link"
          href="https://github.com/mcclowes/clip/blob/main/CONTRIBUTING.md"
        >
          Contribute a schema ↗
        </a>
      </section>
    </main>
  );
}
