export type PlistValue =
  | string
  | number
  | bigint
  | boolean
  | Date
  | Uint8Array
  | PlistValue[]
  | { [key: string]: PlistValue };

export class PlistParseError extends SyntaxError {}

interface OpenTag {
  name: string;
  attributes: Record<string, string>;
  selfClosing: boolean;
}

class Parser {
  private offset = 0;
  private readonly source: string;

  constructor(source: string) {
    this.source = source;
  }

  parse(): PlistValue {
    this.skipMisc();
    const root = this.openTag();
    if (root.name !== "plist" || root.selfClosing) {
      this.fail("root element must be plist");
    }
    for (const name of Object.keys(root.attributes)) {
      if (name !== "version") this.fail(`unexpected plist attribute: ${name}`);
    }
    this.skipSpaceAndComments();
    const value = this.parseValue();
    this.skipSpaceAndComments();
    this.closeTag("plist");
    this.skipMisc();
    if (!this.eof()) this.fail("unexpected content after plist");
    return value;
  }

  private parseValue(): PlistValue {
    const tag = this.openTag();
    if (Object.keys(tag.attributes).length > 0) {
      this.fail(`plist value cannot have attributes: ${tag.name}`);
    }
    switch (tag.name) {
      case "dict":
        return this.parseDictionary(tag.selfClosing);
      case "array":
        return this.parseArray(tag.selfClosing);
      case "string":
      case "key":
        return this.parseTextElement(tag.name, tag.selfClosing);
      case "integer": {
        const text = this.parseTextElement(tag.name, tag.selfClosing).trim();
        if (!/^[+-]?\d+$/.test(text)) this.fail(`invalid integer: ${text}`);
        const value = BigInt(text);
        return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)
          ? Number(value)
          : value;
      }
      case "real": {
        const text = this.parseTextElement(tag.name, tag.selfClosing).trim();
        if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) {
          this.fail(`invalid real: ${text}`);
        }
        return Number(text);
      }
      case "date": {
        const text = this.parseTextElement(tag.name, tag.selfClosing).trim();
        const value = new Date(text);
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(text) || Number.isNaN(value.valueOf())) {
          this.fail(`invalid date: ${text}`);
        }
        return value;
      }
      case "data": {
        const text = this.parseTextElement(tag.name, tag.selfClosing).replace(/\s/g, "");
        if (text !== "" && (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4 !== 0)) {
          this.fail("invalid base64 data");
        }
        return Uint8Array.from(Buffer.from(text, "base64"));
      }
      case "true":
        this.finishBoolean(tag);
        return true;
      case "false":
        this.finishBoolean(tag);
        return false;
      default:
        this.fail(`unsupported plist element: ${tag.name}`);
    }
  }

  private parseDictionary(selfClosing: boolean): { [key: string]: PlistValue } {
    const result: { [key: string]: PlistValue } = Object.create(null) as {
      [key: string]: PlistValue;
    };
    if (selfClosing) return result;
    while (true) {
      this.skipSpaceAndComments();
      if (this.source.startsWith("</dict", this.offset)) {
        this.closeTag("dict");
        return result;
      }
      const keyTag = this.openTag();
      if (keyTag.name !== "key" || Object.keys(keyTag.attributes).length > 0) {
        this.fail("dict entries must start with key");
      }
      const key = this.parseTextElement("key", keyTag.selfClosing);
      this.skipSpaceAndComments();
      result[key] = this.parseValue();
    }
  }

  private parseArray(selfClosing: boolean): PlistValue[] {
    const result: PlistValue[] = [];
    if (selfClosing) return result;
    while (true) {
      this.skipSpaceAndComments();
      if (this.source.startsWith("</array", this.offset)) {
        this.closeTag("array");
        return result;
      }
      result.push(this.parseValue());
    }
  }

  private parseTextElement(name: string, selfClosing: boolean): string {
    if (selfClosing) return "";
    let result = "";
    while (!this.eof() && this.peek() !== "<") {
      const next = this.source.indexOf("<", this.offset);
      const end = next < 0 ? this.source.length : next;
      result += this.decodeEntities(this.source.slice(this.offset, end));
      this.offset = end;
    }
    this.closeTag(name);
    return result;
  }

  private finishBoolean(tag: OpenTag): void {
    if (tag.selfClosing) return;
    this.skipSpaceAndComments();
    this.closeTag(tag.name);
  }

  private openTag(): OpenTag {
    this.expect("<");
    if (this.peek() === "/" || this.peek() === "!" || this.peek() === "?") {
      this.fail("expected opening element");
    }
    const name = this.readName();
    const attributes: Record<string, string> = Object.create(null) as Record<string, string>;
    while (true) {
      this.skipXmlSpace();
      if (this.source.startsWith("/>", this.offset)) {
        this.offset += 2;
        return { name, attributes, selfClosing: true };
      }
      if (this.peek() === ">") {
        this.offset += 1;
        return { name, attributes, selfClosing: false };
      }
      const attribute = this.readName();
      if (Object.prototype.hasOwnProperty.call(attributes, attribute)) {
        this.fail(`duplicate attribute: ${attribute}`);
      }
      this.skipXmlSpace();
      this.expect("=");
      this.skipXmlSpace();
      const quote = this.peek();
      if (quote !== '"' && quote !== "'") this.fail("attribute value must be quoted");
      this.offset += 1;
      const end = this.source.indexOf(quote, this.offset);
      if (end < 0) this.fail("unterminated attribute value");
      attributes[attribute] = this.decodeEntities(this.source.slice(this.offset, end));
      this.offset = end + 1;
    }
  }

  private closeTag(expected: string): void {
    this.expect("</");
    const name = this.readName();
    if (name !== expected) this.fail(`expected closing ${expected}, found ${name}`);
    this.skipXmlSpace();
    this.expect(">");
  }

  private readName(): string {
    const start = this.offset;
    if (!/[A-Za-z_:]/.test(this.peek())) this.fail("invalid XML name");
    this.offset += 1;
    while (/[A-Za-z0-9_.:-]/.test(this.peek())) this.offset += 1;
    return this.source.slice(start, this.offset);
  }

  private decodeEntities(text: string): string {
    return text.replace(/&([^;]+);/g, (_match, entity: string) => {
      const named: Record<string, string> = {
        amp: "&",
        lt: "<",
        gt: ">",
        quot: '"',
        apos: "'",
      };
      if (Object.prototype.hasOwnProperty.call(named, entity)) return named[entity] as string;
      const hexadecimal = /^#x([0-9A-Fa-f]+)$/.exec(entity);
      const decimal = /^#(\d+)$/.exec(entity);
      const codePoint = hexadecimal
        ? Number.parseInt(hexadecimal[1] as string, 16)
        : decimal
          ? Number.parseInt(decimal[1] as string, 10)
          : -1;
      if (codePoint < 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
        this.fail(`invalid XML entity: &${entity};`);
      }
      return String.fromCodePoint(codePoint);
    });
  }

  private skipMisc(): void {
    while (true) {
      this.skipXmlSpace();
      if (this.source.startsWith("<?", this.offset)) {
        const end = this.source.indexOf("?>", this.offset + 2);
        if (end < 0) this.fail("unterminated processing instruction");
        this.offset = end + 2;
      } else if (this.source.startsWith("<!--", this.offset)) {
        this.skipComment();
      } else if (this.source.startsWith("<!DOCTYPE", this.offset)) {
        this.skipDoctype();
      } else {
        return;
      }
    }
  }

  private skipSpaceAndComments(): void {
    while (true) {
      this.skipXmlSpace();
      if (!this.source.startsWith("<!--", this.offset)) return;
      this.skipComment();
    }
  }

  private skipComment(): void {
    const end = this.source.indexOf("-->", this.offset + 4);
    if (end < 0) this.fail("unterminated XML comment");
    this.offset = end + 3;
  }

  private skipDoctype(): void {
    let quote = "";
    let subsetDepth = 0;
    for (; !this.eof(); this.offset += 1) {
      const character = this.peek();
      if (quote) {
        if (character === quote) quote = "";
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === "[") {
        subsetDepth += 1;
      } else if (character === "]") {
        subsetDepth -= 1;
      } else if (character === ">" && subsetDepth === 0) {
        this.offset += 1;
        return;
      }
    }
    this.fail("unterminated doctype");
  }

  private skipXmlSpace(): void {
    while (/[ \t\r\n]/.test(this.peek())) this.offset += 1;
  }

  private expect(value: string): void {
    if (!this.source.startsWith(value, this.offset)) this.fail(`expected ${JSON.stringify(value)}`);
    this.offset += value.length;
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
    throw new PlistParseError(`${message} (line ${line}, column ${column})`);
  }
}

export function parsePlist(source: string): PlistValue {
  return new Parser(source.startsWith("\uFEFF") ? source.slice(1) : source).parse();
}
