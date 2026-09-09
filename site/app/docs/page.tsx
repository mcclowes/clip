import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = {
  title: "Documentation",
  description:
    "Install CLIP, register tools, define capabilities, and generate portable agent skills.",
};
const sections = [
  ["start", "Get started"],
  ["register", "Register tools"],
  ["schemas", "Define capabilities"],
  ["skills", "Generate skills"],
  ["directory", "Community schemas"],
  ["reference", "Command reference"],
];
export default function Docs() {
  return (
    <main className="shell">
      <div className="docs-grid">
        <aside className="docs-nav">
          {sections.map(([id, title]) => (
            <a href={`#${id}`} key={id}>
              {title}
            </a>
          ))}
        </aside>
        <article className="prose">
          <p className="eyebrow">CLIP documentation / v0.1</p>
          <h1>
            Your command line,
            <br />
            shared with your agents.
          </h1>
          <p>
            CLIP stands for Command Line Interface Protocol. It registers installed tools, records
            what they’re for, and generates skills that describe their capabilities. Your agents run
            the original CLI directly.
          </p>
          <section id="start">
            <h2>Get started</h2>
            <p>Install through the Homebrew tap:</p>
            <pre>
              <code>{"brew install mcclowes/clip/clip\nclip --version\nclip discover"}</code>
            </pre>
            <p>
              CLIP requires Node.js 24 or later, installed by the formula. To run from source, clone{" "}
              <a href="https://github.com/mcclowes/clip">the repository</a>, run{" "}
              <code>npm ci && npm run build</code>, then{" "}
              <code>node packages/cli/dist/main.js --help</code>.
            </p>
            <pre>
              <code>
                {'clip registry add git --purpose "Review repository changes"\nclip sync'}
              </code>
            </pre>
            <p>
              Your project now contains <code>.agents/skills/clip-git/SKILL.md</code> and its
              capability document.
            </p>
          </section>
          <section id="register">
            <h2>Register tools with a purpose</h2>
            <p>
              <code>clip discover</code> lists executable files on PATH without running them. Choose
              which tools to register; discovery doesn’t opt tools in automatically.
            </p>
            <pre>
              <code>
                {
                  'clip discover git --limit 20\nclip register mytool --purpose "Manage project deployments" --probe schema'
                }
              </code>
            </pre>
            <p>
              For a tool with a <code>capabilities</code> command, use{" "}
              <code>--probe capabilities</code>. Probes are explicit, time out after five seconds,
              and cap output at 1 MiB. CLIP doesn’t infer capabilities by executing arbitrary
              commands or parsing help.
            </p>
            <p>
              You can also register without a schema, then add one later. Re-registering updates the
              purpose and schema for that tool. Use <code>clip list</code> to inspect registrations
              and <code>clip remove mytool</code> to remove one. Project changes default to the local,
              uncommitted <code>.clip/tools.local.json</code>. Use <code>--scope shared</code> for a
              repository toolset or <code>--scope global</code> for user-wide tools.
            </p>
          </section>
          <section id="schemas">
            <h2>Define capabilities</h2>
            <p>
              We encourage the structured output and introspection principles in{" "}
              <a href="https://clispec.dev/spec/v0.2/">CLI Spec v0.2</a>. Native schemas are
              preserved, including nested commands, arguments, output fields, and mutation markers.
              A schema should describe what an agent can do beyond help text.
            </p>
            <p>When a tool has no schema, start a draft:</p>
            <pre>
              <code>
                {'clip schema init mytool --purpose "Manage deployments" --file mytool.json'}
              </code>
            </pre>
            <p>Add real operations to the empty commands list before registration. For example:</p>
            <pre>
              <code>
                {JSON.stringify(
                  {
                    name: "mytool",
                    commands: [
                      {
                        name: "list",
                        description: "List deployments",
                        mutating: false,
                        args: [{ name: "--limit", type: "integer", default: 20 }],
                      },
                    ],
                  },
                  null,
                  2,
                )}
              </code>
            </pre>
            <pre>
              <code>
                {
                  'clip register mytool --purpose "Manage deployments" --schema mytool.json\nclip schema mytool'
                }
              </code>
            </pre>
            <p>
              A minimal document can use <code>capabilities</code> instead of <code>commands</code>.
              Every entry needs a name and description. Mutation markers are optional; missing means
              unknown, never read-only. Add a CLI Spec version claim only when the tool meets that
              specification.
            </p>
          </section>
          <section id="skills">
            <h2>Generate and maintain skills</h2>
            <pre>
              <code>{"clip sync\nclip sync --skills-dir .claude/skills"}</code>
            </pre>
            <p>
              Each skill includes your purpose, executable path, operations, provenance, and a full{" "}
              <code>schema.json</code>. The default destination is <code>.agents/skills</code> in
              the current project. Choose the skills directory your agent reads.
            </p>
            <p>
              Run sync after changing or removing registrations. CLIP refreshes its own skills and
              removes stale ones, while refusing collisions with unowned directories or extra user
              files. Generated files are managed output; edit the source schema or registration
              instead.
            </p>
            <p>
              Registrations merge from <code>~/.config/clip/tools.json</code>, shared project{" "}
              <code>.clip/tools.json</code>, and local project <code>.clip/tools.local.json</code>.
              Local entries override shared entries, which override global entries. Set{" "}
              <code>CLIP_HOME</code> to move the global directory. Skills provide guidance; they don’t
              grant permissions, store credentials, or bypass your agent’s approval rules.
            </p>
          </section>
          <section id="directory">
            <h2>Use community schemas</h2>
            <pre>
              <code>
                {
                  'clip registry search github\nclip schema show gh\nclip registry add gh --purpose "Review pull requests"\nclip sync'
                }
              </code>
            </pre>
            <p>
              The <Link href="/tools">tool directory</Link> and CLI share a Git-backed catalog.
              Entries include a maintainer, schema version, source links, coverage, and a SHA-256
              digest. CLIP verifies the digest before installing a schema. The executable must
              already be installed.
            </p>
            <p>
              The first release bundles the catalog for offline use. Upgrade CLIP to get catalog
              updates, then reinstall an entry and sync to update its generated skills. You can
              always register a newer local schema with <code>--schema</code>.
            </p>
            <p>
              <a href="https://github.com/mcclowes/clip/blob/main/CONTRIBUTING.md">
                Contribute a schema
              </a>{" "}
              through a pull request. There are no fabricated install counts or rankings; the
              directory starts with a small, documented set of tools.
            </p>
          </section>
          <section id="reference">
            <h2>Command reference</h2>
            <p>
              Run <code>clip schema</code> or <code>clip capabilities</code> for the
              machine-readable command contract. Both work offline without configuration.
            </p>
            <pre>
              <code>
                {
                  "clip discover [query]\nclip register <executable> --purpose <text> [--schema <file> | --probe schema|capabilities] [--scope local|shared|global]\nclip list\nclip remove <name> [--scope local|shared|global]\nclip schema\nclip capabilities\nclip schema show <id>\nclip schema init <name> --purpose <text> --file <path>\nclip sync [--skills-dir <path>]\nclip registry search [query]\nclip registry add <id> --purpose <text> [--scope local|shared|global]"
                }
              </code>
            </pre>
            <p>
              All commands accept <code>--output auto|json|text</code>. Auto uses JSON when piped
              and readable text on a terminal. List commands accept <code>--limit</code> from 1 to
              10000, defaulting to 100, and include truncation metadata. Failures exit 1 with a
              structured error on stderr.
            </p>
          </section>
        </article>
      </div>
    </main>
  );
}
