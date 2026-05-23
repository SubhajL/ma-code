export type HarnessRunner = (argv: string[]) => Promise<number>;

export type HarnessRunnerLoader = () => Promise<HarnessRunner>;

export type HarnessDispatchTable = Record<string, HarnessRunnerLoader>;

export class HarnessUnknownSubcommandError extends Error {
  readonly subcommand: string;
  readonly knownSubcommands: readonly string[];

  constructor(subcommand: string, knownSubcommands: readonly string[] = []) {
    const known = knownSubcommands.length > 0 ? ` (known: ${knownSubcommands.join(", ")})` : "";
    super(`Unknown subcommand: ${subcommand}${known}`);
    this.name = "HarnessUnknownSubcommandError";
    this.subcommand = subcommand;
    this.knownSubcommands = knownSubcommands;
  }
}

export async function runHarnessCommand(
  table: HarnessDispatchTable,
  subcommand: string,
  argv: string[],
): Promise<number> {
  const loader = table[subcommand];
  if (!loader) {
    throw new HarnessUnknownSubcommandError(subcommand, Object.keys(table));
  }
  const runner = await loader();
  return runner(argv);
}
