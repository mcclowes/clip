/**
 * ---
 * purpose: Command line entry for the fictional brindle tool used by the evals.
 * ---
 */
import { helpText, paddedCommands, UsageError, type Command, type Values } from './spec.ts';
import { execute, extraCommands } from './state.ts';

const list = paddedCommands(extraCommands());

function matchCommand(argv: string[]): { command?: Command; rest: string[] } {
  const sorted = [...list].sort((a, b) => b.name.length - a.name.length);
  for (const command of sorted) {
    const words = command.name.split(' ');
    if (words.every((word, index) => argv[index] === word)) return { command, rest: argv.slice(words.length) };
  }
  return { rest: argv };
}

function parseArgs(command: Command, rest: string[]): Values {
  const values: Values = {};
  const positionals = command.args.filter(arg => arg.positional);
  for (let index = 0; index < rest.length; index++) {
    const token = rest[index]!;
    if (!token.startsWith('--')) {
      const slot = positionals.shift();
      if (!slot) throw new UsageError(`Unexpected argument: ${token}.`);
      values[slot.name] = token;
      continue;
    }
    const [flag, inline] = token.split(/=(.*)/s) as [string, string | undefined];
    const arg = command.args.find(item => item.name === flag);
    if (!arg) throw new UsageError(`Unknown flag for ${command.name}: ${flag}. Run "brindle ${command.name} --help".`);
    if (arg.type === 'boolean') values[flag.slice(2)] = true;
    else {
      const value = inline ?? rest[++index];
      if (value === undefined) throw new UsageError(`${flag} needs a value.`);
      values[flag.slice(2)] = value;
    }
  }
  return values;
}

function main(argv: string[]): number {
  const wantsHelp = argv.includes('--help') || argv.includes('-h');
  const { command, rest } = matchCommand(argv.filter(token => token !== '--help' && token !== '-h'));
  if (wantsHelp || !argv.length) {
    process.stdout.write(helpText(list, command?.name));
    return 0;
  }
  try {
    if (!command) throw new UsageError(`Unknown command: ${argv.join(' ')}. Run "brindle --help".`);
    process.stdout.write(JSON.stringify(execute(command, parseArgs(command, rest)), null, 2) + '\n');
    return 0;
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(JSON.stringify({ error: error.message }) + '\n');
    return 2;
  }
}

process.exitCode = main(process.argv.slice(2));
