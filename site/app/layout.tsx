import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL("https://clip-protocol.mcclowes.chatgpt.site"),
  title: { default: "CLIP — tools for people and agents", template: "%s | CLIP" },
  description:
    "Register CLI tools, describe their capabilities, and generate portable agent skills. Browse community-maintained CLI schemas.",
  openGraph: {
    title: "CLIP — tools for people and agents",
    description: "Your command line, shared with your agents.",
    type: "website",
    images: ["https://clip-protocol.mcclowes.chatgpt.site/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "CLIP — tools for people and agents",
    description: "Your command line, shared with your agents.",
    images: ["https://clip-protocol.mcclowes.chatgpt.site/og.png"],
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
            <span className="brand-mark">./</span> clip
          </Link>
          <nav aria-label="Main navigation">
            <Link href="/tools">[ tools ]</Link>
            <Link href="/docs">[ docs ]</Link>
            <a href="https://github.com/mcclowes/clip">[ source ↗ ]</a>
          </nav>
          <span className="nav-note"><i /> system online</span>
        </header>
        <div id="content">{children}</div>
        <footer>
          <Link href="/" className="brand">
            ./clip
          </Link>
          <p>one interface / shared capabilities</p>
          <a href="https://clispec.dev/spec/v0.2/">CLI Spec principles ↗</a>
        </footer>
      </body>
    </html>
  );
}
