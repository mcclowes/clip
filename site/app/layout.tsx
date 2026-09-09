import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL("https://clip-protocol.plucky-bay-1824.chatgpt.site"),
  title: { default: "CLIP — tools for people and agents", template: "%s | CLIP" },
  description:
    "Register CLI tools, describe their capabilities, and generate portable agent skills. Browse community-maintained CLI schemas.",
  openGraph: {
    title: "CLIP — tools for people and agents",
    description: "Your command line, shared with your agents.",
    type: "website",
    images: ["https://clip-protocol.plucky-bay-1824.chatgpt.site/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "CLIP — tools for people and agents",
    description: "Your command line, shared with your agents.",
    images: ["https://clip-protocol.plucky-bay-1824.chatgpt.site/og.png"],
  },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#content">
          Skip to content
        </a>
        <header className="nav">
          <Link href="/" className="brand">
            <span className="brand-mark">&gt;_</span> CLIP
          </Link>
          <nav aria-label="Main navigation">
            <Link href="/tools">Directory</Link>
            <Link href="/docs">Docs</Link>
            <a href="https://github.com/mcclowes/clip">GitHub ↗</a>
          </nav>
          <span className="nav-note">Built for the command line</span>
        </header>
        <div id="content">{children}</div>
        <footer>
          <Link href="/" className="brand">
            &gt;_ CLIP
          </Link>
          <p>One interface. Shared capabilities.</p>
          <a href="https://clispec.dev/spec/v0.2/">Built on CLI Spec principles ↗</a>
        </footer>
      </body>
    </html>
  );
}
