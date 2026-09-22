import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import type {LoadContext, Plugin} from '@docusaurus/types';
import type {Compilation, Compiler, Module} from 'webpack';
import {attachSupplementalNotices, type Inventory, renderNotices, shippedPackages, updateInventory, validate} from './inventory.ts';

const pluginName = 'third-party-licenses';
export const noticesAsset = 'third-party-notices.txt';

function resourcesOf(modules: Iterable<Module>, into = new Set<string>()) {
  for (const module of modules) {
    const {resource, modules: inner} = module as Module & {resource?: string; modules?: Module[]};
    if (resource) into.add(resource.split('?')[0]);
    if (inner) resourcesOf(inner, into);
  }
  return into;
}

class ThirdPartyLicensesWebpackPlugin {
  constructor(
    private readonly inventoryPath: string,
    private readonly noticesDirectory: string,
  ) {}

  apply(compiler: Compiler) {
    if (compiler.options.mode !== 'production') return;
    const {WebpackError, sources} = compiler.webpack;
    compiler.hooks.thisCompilation.tap(pluginName, (compilation: Compilation) => {
      compilation.hooks.processAssets.tap(
        {name: pluginName, stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL},
        () => {
          // Modules outside every chunk run only at build time, such as css-loader under CSS extraction.
          const inChunks = [...compilation.modules].filter((module) => compilation.chunkGraph.getNumberOfModuleChunks(module) > 0);
          const bundled = shippedPackages(resourcesOf(inChunks));
          let inventory: Inventory = JSON.parse(readFileSync(this.inventoryPath, 'utf8'));
          if (process.env.CLIP_LICENSES_WRITE === '1') {
            inventory = updateInventory(inventory, bundled);
            writeFileSync(this.inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
          }
          const {packages: shipped, failures} = attachSupplementalNotices(inventory, bundled, this.noticesDirectory);
          for (const failure of [...failures, ...validate(inventory, shipped)]) {
            compilation.errors.push(new WebpackError(`[${pluginName}] ${failure}`));
          }
          compilation.emitAsset(noticesAsset, new sources.RawSource(renderNotices(shipped)));
        },
      );
    });
  }
}

export default function thirdPartyLicenses(context: LoadContext): Plugin {
  const directory = join(context.siteDir, 'third-party');
  return {
    name: pluginName,
    configureWebpack(_config, isServer) {
      return isServer ? {} : {plugins: [new ThirdPartyLicensesWebpackPlugin(join(directory, 'licenses.json'), join(directory, 'notices'))]};
    },
  };
}
