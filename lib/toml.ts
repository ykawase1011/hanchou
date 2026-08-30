import { readFileSync } from "node:fs";
import type { PathLike } from "node:fs";

export type TomlValue = string | number | boolean | TomlValue[] | TomlTable;

export interface TomlTable {
  [key: string]: TomlValue;
}

export class TomlParseError extends SyntaxError {}

const hasOwn = (value: TomlTable, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const table = (): TomlTable => Object.create(null) as TomlTable;

const isTable = (value: TomlValue): value is TomlTable =>
  typeof value === "object" && value !== null && !Array.isArray(value);

class Parser {
  private readonly source: string;
  private offset = 0;
  private readonly root = table();
  private current = this.root;

  constructor(source: string) {
    this.source = source.startsWith("\uFEFF") ? source.slice(1) : source;
  }

  parse(): TomlTable {
    while (true) {
      this.skipIgnored();
      if (this.eof()) {
        return this.root;
      }
      if (this.peek() === "[") {
        this.parseHeader();
      } else {
        this.parseAssignment();
      }
    }
  }

  private parseHeader(): void {
    this.expect("[");
    const arrayHeader = this.peek() === "[";
    if (arrayHeader) {
      this.offset += 1;
    }
    this.skipHorizontal();
    const path = this.parseKeyPath(arrayHeader ? "]" : "]");
    this.skipHorizontal();
    this.expect("]");
    if (arrayHeader) {
      this.expect("]");
    }
    this.finishStatement();
    this.current = this.resolveHeader(path, arrayHeader);
  }

  private resolveHeader(path: string[], arrayHeader: boolean): TomlTable {
    if (path.length === 0) {
      this.fail("empty table header");
    }
    let cursor = this.root;
    for (const key of path.slice(0, -1)) {
      if (!hasOwn(cursor, key)) {
        cursor[key] = table();
      }
      let next: TomlValue | undefined = cursor[key];
      if (Array.isArray(next)) {
        next = next.at(-1);
      }
      if (next === undefined || !isTable(next)) {
        this.fail(`table path conflicts with an existing value: ${path.join(".")}`);
      }
      cursor = next;
    }

    const key = path.at(-1) as string;
    if (arrayHeader) {
      if (!hasOwn(cursor, key)) {
        cursor[key] = [];
      }
      const values = cursor[key];
      if (!Array.isArray(values)) {
        this.fail(`array table conflicts with an existing value: ${path.join(".")}`);
      }
      const next = table();
      values.push(next);
      return next;
    }

    if (!hasOwn(cursor, key)) {
      cursor[key] = table();
    }
    let existing: TomlValue | undefined = cursor[key];
    if (Array.isArray(existing)) {
      existing = existing.at(-1);
    }
    if (existing === undefined || !isTable(existing)) {
      this.fail(`table conflicts with an existing value: ${path.join(".")}`);
    }
    return existing;
  }

  private parseAssignment(): void {
    const path = this.parseKeyPath("=");
    this.skipHorizontal();
    this.expect("=");
    this.skipHorizontal();
    const value = this.parseValue();
    this.finishStatement();
    this.assign(this.current, path, value);
  }

  private assign(destination: TomlTable, path: string[], value: TomlValue): void {
    if (path.length === 0) {
      this.fail("empty key");
    }
    let cursor = destination;
    for (const key of path.slice(0, -1)) {
      if (!hasOwn(cursor, key)) {
        cursor[key] = table();
      }
      const next = cursor[key];
      if (!isTable(next)) {
        this.fail(`key path conflicts with an existing value: ${path.join(".")}`);
      }
      cursor = next;
    }
    const key = path.at(-1) as string;
    if (hasOwn(cursor, key)) {
      this.fail(`duplicate key: ${path.join(".")}`);
    }
    cursor[key] = value;
  }

  private parseKeyPath(terminator: string): string[] {
    const keys: string[] = [];
    while (true) {
      this.skipHorizontal();
      const character = this.peek();
      if (character === terminator || character === "]") {
        break;
      }
      if (character === "\"") {
        keys.push(this.parseBasicString(false));
      } else if (character === "'") {
        keys.push(this.parseLiteralString(false));
      } else {
        const start = this.offset;
        while (/[A-Za-z0-9_-]/.test(this.peek())) {
          this.offset += 1;
        }
        if (this.offset === start) {
          this.fail("invalid bare key");
        }
        keys.push(this.source.slice(start, this.offset));
      }
      this.skipHorizontal();
      if (this.peek() !== ".") {
        break;
      }
      this.offset += 1;
    }
    return keys;
  }

  private parseValue(): TomlValue {
    if (this.source.startsWith('"""', this.offset)) {
      return this.parseBasicString(true);
    }
    if (this.source.startsWith("'''", this.offset)) {
      return this.parseLiteralString(true);
    }
    switch (this.peek()) {
      case '"':
        return this.parseBasicString(false);
      case "'":
        return this.parseLiteralString(false);
      case "[":
        return this.parseArray();
      case "{":
        return this.parseInlineTable();
      default:
        return this.parseBareValue();
    }
  }

  private parseBasicString(multiline: boolean): string {
    this.expect(multiline ? '"""' : '"');
    if (multiline) {
      this.consumeInitialNewline();
    }
    let result = "";
    while (!this.eof()) {
      if (multiline ? this.source.startsWith('"""', this.offset) : this.peek() === '"') {
        this.offset += multiline ? 3 : 1;
        return result;
      }
      const character = this.peek();
      if (!multiline && (character === "\n" || character === "\r")) {
        this.fail("newline in a basic string");
      }
      if (character === "\\") {
        this.offset += 1;
        if (multiline && (this.peek() === "\n" || this.source.startsWith("\r\n", this.offset))) {
          this.consumeNewline();
          while (/\s/.test(this.peek())) {
            this.offset += 1;
          }
          continue;
        }
        result += this.parseEscape();
        continue;
      }
      const code = character.codePointAt(0);
      if (code !== undefined && code < 0x20 && character !== "\t" && character !== "\n" && character !== "\r") {
        this.fail("control character in a basic string");
      }
      result += character;
      this.offset += character.length;
    }
    this.fail("unterminated basic string");
  }

  private parseEscape(): string {
    const character = this.peek();
    this.offset += 1;
    const simple: Record<string, string> = {
      b: "\b",
      t: "\t",
      n: "\n",
      f: "\f",
      r: "\r",
      '"': '"',
      "\\": "\\",
    };
    if (Object.prototype.hasOwnProperty.call(simple, character)) {
      return simple[character] as string;
    }
    if (character === "u" || character === "U") {
      const length = character === "u" ? 4 : 8;
      const digits = this.source.slice(this.offset, this.offset + length);
      if (!new RegExp(`^[0-9A-Fa-f]{${length}}$`).test(digits)) {
        this.fail("invalid Unicode escape");
      }
      this.offset += length;
      const codePoint = Number.parseInt(digits, 16);
      if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
        this.fail("invalid Unicode code point");
      }
      return String.fromCodePoint(codePoint);
    }
    this.fail(`invalid escape sequence: \\${character}`);
  }

  private parseLiteralString(multiline: boolean): string {
    this.expect(multiline ? "'''" : "'");
    if (multiline) {
      this.consumeInitialNewline();
    }
    const ending = multiline ? "'''" : "'";
    const start = this.offset;
    const end = this.source.indexOf(ending, start);
    if (end < 0) {
      this.fail("unterminated literal string");
    }
    const value = this.source.slice(start, end);
    if (!multiline && /[\r\n]/.test(value)) {
      this.fail("newline in a literal string");
    }
    this.offset = end + ending.length;
    return value;
  }

  private parseArray(): TomlValue[] {
    this.expect("[");
    const values: TomlValue[] = [];
    this.skipArrayIgnored();
    if (this.peek() === "]") {
      this.offset += 1;
      return values;
    }
    while (true) {
      values.push(this.parseValue());
      this.skipArrayIgnored();
      if (this.peek() === "]") {
        this.offset += 1;
        return values;
      }
      this.expect(",");
      this.skipArrayIgnored();
      if (this.peek() === "]") {
        this.offset += 1;
        return values;
      }
    }
  }

  private parseInlineTable(): TomlTable {
    this.expect("{");
    const result = table();
    this.skipHorizontal();
    if (this.peek() === "}") {
      this.offset += 1;
      return result;
    }
    while (true) {
      const key = this.parseKeyPath("=");
      this.skipHorizontal();
      this.expect("=");
      this.skipHorizontal();
      this.assign(result, key, this.parseValue());
      this.skipHorizontal();
      if (this.peek() === "}") {
        this.offset += 1;
        return result;
      }
      this.expect(",");
      this.skipHorizontal();
      if (this.peek() === "}") {
        this.fail("trailing comma in an inline table");
      }
    }
  }

  private parseBareValue(): TomlValue {
    const start = this.offset;
    while (!this.eof() && !/[\s,#\]}]/.test(this.peek())) {
      this.offset += 1;
    }
    const token = this.source.slice(start, this.offset);
    if (token === "true") return true;
    if (token === "false") return false;
    if (/^[+-]?(?:inf|nan)$/.test(token)) {
      if (token.endsWith("nan")) return Number.NaN;
      return token.startsWith("-") ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
    }

    const digits = token.replaceAll("_", "");
    if (/^[+-]?0x[0-9A-Fa-f](?:_?[0-9A-Fa-f])*$/.test(token)) {
      return Number.parseInt(digits.replace(/^\+/, ""), 16);
    }
    if (/^[+-]?0o[0-7](?:_?[0-7])*$/.test(token)) {
      const sign = digits.startsWith("-") ? -1 : 1;
      return sign * Number.parseInt(digits.replace(/^[+-]?0o/, ""), 8);
    }
    if (/^[+-]?0b[01](?:_?[01])*$/.test(token)) {
      const sign = digits.startsWith("-") ? -1 : 1;
      return sign * Number.parseInt(digits.replace(/^[+-]?0b/, ""), 2);
    }
    if (/^[+-]?(?:0|[1-9](?:_?[0-9])*)$/.test(token)) {
      return Number.parseInt(digits, 10);
    }
    if (
      /^[+-]?[0-9](?:_?[0-9])*\.[0-9](?:_?[0-9])*(?:[eE][+-]?[0-9](?:_?[0-9])*)?$/.test(token) ||
      /^[+-]?[0-9](?:_?[0-9])*[eE][+-]?[0-9](?:_?[0-9])*$/.test(token)
    ) {
      return Number(digits);
    }
    if (
      /^\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})?)?$/.test(token) ||
      /^\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(token)
    ) {
      return token;
    }
    this.fail(`invalid value: ${token || "<empty>"}`);
  }

  private finishStatement(): void {
    this.skipHorizontal();
    if (this.peek() === "#") {
      this.skipComment();
    }
    if (this.eof()) return;
    if (this.peek() === "\r") this.offset += 1;
    if (this.peek() !== "\n") {
      this.fail("unexpected characters after statement");
    }
    this.offset += 1;
  }

  private skipIgnored(): void {
    while (!this.eof()) {
      if (/[ \t\r\n]/.test(this.peek())) {
        this.offset += 1;
      } else if (this.peek() === "#") {
        this.skipComment();
      } else {
        return;
      }
    }
  }

  private skipArrayIgnored(): void {
    while (!this.eof()) {
      if (/\s/.test(this.peek())) {
        this.offset += 1;
      } else if (this.peek() === "#") {
        this.skipComment();
      } else {
        return;
      }
    }
  }

  private skipHorizontal(): void {
    while (this.peek() === " " || this.peek() === "\t") {
      this.offset += 1;
    }
  }

  private skipComment(): void {
    while (!this.eof() && this.peek() !== "\n") {
      this.offset += 1;
    }
  }

  private consumeInitialNewline(): void {
    if (this.peek() === "\n" || this.source.startsWith("\r\n", this.offset)) {
      this.consumeNewline();
    }
  }

  private consumeNewline(): void {
    if (this.source.startsWith("\r\n", this.offset)) {
      this.offset += 2;
    } else if (this.peek() === "\n") {
      this.offset += 1;
    } else {
      this.fail("expected newline");
    }
  }

  private expect(expected: string): void {
    if (!this.source.startsWith(expected, this.offset)) {
      this.fail(`expected ${JSON.stringify(expected)}`);
    }
    this.offset += expected.length;
  }

  private peek(): string {
    return this.source[this.offset] ?? "";
  }

  private eof(): boolean {
    return this.offset >= this.source.length;
  }

  private fail(message: string): never {
    const before = this.source.slice(0, this.offset);
    const line = before.split(/\r\n|\r|\n/).length;
    const lastNewline = Math.max(before.lastIndexOf("\n"), before.lastIndexOf("\r"));
    const column = this.offset - lastNewline;
    throw new TomlParseError(`${message} (line ${line}, column ${column})`);
  }
}

export function parseToml(source: string): TomlTable {
  return new Parser(source).parse();
}

export function readToml(path: PathLike): TomlTable {
  const source = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path));
  return parseToml(source);
}
