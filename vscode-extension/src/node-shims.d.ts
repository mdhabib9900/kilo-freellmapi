// Self-contained Node 16 runtime declarations for standalone VS Code v1.70.2 compilation
declare function setTimeout(callback: (...args: any[]) => void, ms?: number): any;
declare function clearTimeout(timeoutId: any): void;

interface Buffer {
  readonly length: number;
  toString(encoding?: string): string;
  writeUInt32BE(value: number, offset?: number): number;
  [index: number]: number;
}

declare var Buffer: {
  from(data: string | number[] | Uint8Array, encoding?: string): Buffer;
  alloc(size: number): Buffer;
  concat(list: Buffer[]): Buffer;
  isBuffer(obj: any): obj is Buffer;
  byteLength(string: string, encoding?: string): number;
};

declare module 'crypto' {
  export function createHash(algorithm: string): {
    update(data: string | Buffer): { digest(): Buffer; digest(encoding: 'hex' | 'base64'): string };
  };
  export function randomBytes(size: number): Buffer;
  export function createCipheriv(algorithm: string, key: Buffer, iv: Buffer): {
    update(data: string, inputEncoding: string): Buffer;
    final(): Buffer;
    getAuthTag(): Buffer;
  };
  export function createDecipheriv(algorithm: string, key: Buffer, iv: Buffer): {
    setAuthTag(buffer: Buffer): void;
    update(data: Buffer): Buffer;
    final(): Buffer;
  };
}

declare module 'fs' {
  export function existsSync(path: string): boolean;
  export function statSync(path: string): { isFile(): boolean; size: number };
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function writeFileSync(path: string, data: string | Buffer, encoding?: string): void;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
}

declare module 'path' {
  export const sep: string;
  export function join(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
  export function dirname(p: string): string;
  export function relative(from: string, to: string): string;
}

declare module 'url' {
  export class URL {
    readonly protocol: string;
    readonly hostname: string;
    readonly port: string;
    readonly pathname: string;
    readonly search: string;
    constructor(input: string, base?: string);
  }
}

declare module 'http' {
  export interface IncomingMessage {
    method?: string;
    url?: string;
    statusCode?: number;
    headers: Record<string, string | string[] | undefined>;
    on(event: 'data', listener: (chunk: Buffer) => void): this;
    on(event: 'end', listener: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
  }
  export interface ServerResponse {
    setHeader(name: string, value: string): void;
    writeHead(statusCode: number, headers?: Record<string, string>): void;
    write(chunk: string | Buffer): boolean;
    end(data?: string | Buffer): void;
  }
  export interface ClientRequest {
    setTimeout(timeout: number, callback?: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    write(chunk: string | Buffer): boolean;
    end(): void;
    destroy(error?: Error): this;
  }
  export interface Server {
    on(event: 'error', listener: (err: Error) => void): this;
    listen(port: number, hostname: string, backlog?: () => void): this;
    close(callback?: () => void): this;
  }
  export function request(options: Record<string, any>, callback?: (res: IncomingMessage) => void): ClientRequest;
  export function createServer(requestListener?: (req: IncomingMessage, res: ServerResponse) => void): Server;
}

declare module 'https' {
  import { IncomingMessage, ClientRequest } from 'http';
  export function request(options: Record<string, any>, callback?: (res: IncomingMessage) => void): ClientRequest;
}
