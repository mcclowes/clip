import type {Config} from '@docusaurus/types';
import type {Options, ThemeConfig} from '@docusaurus/preset-classic';
import {themes as prismThemes} from 'prism-react-renderer';

const config: Config = {
  title: 'CLIP',
  tagline: 'Command Line Interface Protocol',
  favicon: 'img/favicon.svg',
  url: 'https://clip-protocol.mcclowes.chatgpt.site',
  baseUrl: '/',
  organizationName: 'mcclowes',
  projectName: 'clip',
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'warn',
  trailingSlash: false,
  presets: [
    [
      'classic',
      {
        docs: {routeBasePath: 'docs', sidebarPath: './sidebars.ts'},
        blog: false,
        theme: {customCss: './src/css/custom.css'},
      } satisfies Options,
    ],
  ],
  themeConfig: {
    image: 'img/og.png',
    colorMode: {defaultMode: 'dark', disableSwitch: true, respectPrefersColorScheme: false},
    navbar: {
      title: './clip',
      items: [
        {to: '/tools', label: '[ tools ]', position: 'left'},
        {to: '/docs', label: '[ docs ]', position: 'left'},
        {href: 'https://github.com/mcclowes/clip', label: '[ source ↗ ]', position: 'right'},
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {title: './clip', items: [{label: 'Docs', to: '/docs'}, {label: 'Tools', to: '/tools'}]},
        {title: 'Source', items: [{label: 'GitHub ↗', href: 'https://github.com/mcclowes/clip'}, {label: 'CLI Spec principles ↗', href: 'https://clispec.dev/spec/v0.2/'}]},
      ],
      copyright: `CLIP ${new Date().getFullYear()} / one interface / shared capabilities`,
    },
    prism: {theme: prismThemes.github, darkTheme: prismThemes.vsDark},
    metadata: [{name: 'description', content: 'Register CLI tools, describe their capabilities, and generate portable agent skills.'}],
  } satisfies ThemeConfig,
};

export default config;
