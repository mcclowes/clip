import Link from "next/link";

export default function Home() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Command Line Interface Protocol / v0.1</p>
        <h1>
          Your tools.
          <br />
          On the command line.
          <br />
          <span>For everyone.</span>
        </h1>
        <p className="lede">
          Give agents the tools you already use. CLIP connects installed CLIs to clear capabilities
          and portable skills.
        </p>
        <div className="actions">
          <Link className="primary-link" href="/docs">
            Get started <span>↗</span>
          </Link>
          <a href="https://github.com/mcclowes/clip">View on GitHub ↗</a>
        </div>
      </section>
      <section className="terminal" aria-label="CLIP workflow example">
        <div className="terminal-bar">
          <span>● ● ●</span>
          <span>~/your-project</span>
        </div>
        <pre>
          <code>
            <span className="comment"># Find tools you already have</span>
            {"\n"}
            <span className="prompt">$</span> clip discover{"\n\n"}
            <span className="comment"># Give a tool a purpose and capabilities</span>
            {"\n"}
            <span className="prompt">$</span> clip register gh --purpose &quot;Work with
            GitHub&quot; \\{"\n"} --schema ./gh.json{"\n\n"}
            <span className="comment"># Make it available to your agents</span>
            {"\n"}
            <span className="prompt">$</span> clip sync{"\n"}
            <span className="result">.agents/skills/clip-gh/SKILL.md</span>
          </code>
        </pre>
      </section>
      <section className="section intro">
        <p className="eyebrow">A shared interface</p>
        <h2>
          The CLI is already there.
          <br />
          Make its capabilities discoverable.
        </h2>
        <div className="three">
          <article>
            <span className="number">01 / Register</span>
            <h3>Use what’s installed</h3>
            <p>
              Find executables on your PATH. Choose the tools your agents should know about, and
              explain what each is for.
            </p>
          </article>
          <article>
            <span className="number">02 / Describe</span>
            <h3>Make commands explicit</h3>
            <p>
              Read a tool’s native schema, define your own, or install a description from the
              community directory.
            </p>
          </article>
          <article>
            <span className="number">03 / Share</span>
            <h3>Keep skills in sync</h3>
            <p>
              Generate readable skills for your project. People and agents run the same commands,
              with the same permissions.
            </p>
          </article>
        </div>
      </section>
      <section className="callout">
        <div>
          <p className="eyebrow">The community directory</p>
          <h2>A capability file for your next tool.</h2>
          <p>Discover versioned CLI descriptions. Inspect the commands, then install the schema.</p>
        </div>
        <Link className="primary-link" href="/tools">
          Browse tools ↗
        </Link>
      </section>
    </main>
  );
}
