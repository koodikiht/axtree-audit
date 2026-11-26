// SPDX-FileCopyrightText: 2026 Mark (malfunctionAI) / KoodiKiht
// SPDX-License-Identifier: MIT

declare interface ImportMeta {
  main?: boolean;
  url: string;
}

declare const process: {
  argv: string[];
  exit(code?: number): never;
};

declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function realpathSync(path: string): string;
}

declare module "node:url" {
  export function pathToFileURL(path: string): URL;
}

declare module "bun:test" {
  export function describe(name: string, fn: () => void): void;
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function expect(actual: unknown): {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toContain(expected: unknown): void;
    toHaveLength(expected: number): void;
    toBeGreaterThan(expected: number): void;
  };
}
