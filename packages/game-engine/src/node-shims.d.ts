declare module "node:fs" {
  export function existsSync(path: string): boolean;
}

declare module "node:url" {
  export function fileURLToPath(url: URL | string): string;
}

interface ImportMeta {
  readonly url: string;
}

declare class URL {
  public constructor(input: string, base?: string | URL);
  public readonly href: string;
}
