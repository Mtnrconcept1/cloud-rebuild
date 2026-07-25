/*
 * Small BZip2 decompressor adapted for typed arrays.
 *
 * Copyright (c) 2011 antimatter15 (antimatter15@gmail.com).
 * Based on micro-bunzip by Rob Landley.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is furnished
 * to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * Source lineage: antimatter15/bzip2.js, as distributed in s-macke/jor1k.
 * TOK adaptation: ES module, strict TypeScript, Uint8Array output and bounded
 * allocations. The payload is an application-owned static build artifact.
 */

type BitReader = (count: number) => number;

type HuffmanGroup = {
  permute: Int32Array;
  limit: Int32Array;
  base: Int32Array;
  minLen: number;
  maxLen: number;
};

type BzipContext = {
  byteCount: Int32Array;
  symToByte: Uint8Array;
  mtfSymbol: Int32Array;
  selectors: Uint8Array;
};

const MAX_HUFCODE_BITS = 20;
const MAX_SYMBOLS = 258;
const SYMBOL_RUNA = 0;
const SYMBOL_RUNB = 1;
const GROUP_SIZE = 50;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

function fail(message: string): never {
  throw new Error(`BZip2: ${message}`);
}

function createBitReader(bytes: Uint8Array): BitReader {
  let bitOffset = 0;
  let byteOffset = 0;
  const masks = [0, 0x01, 0x03, 0x07, 0x0f, 0x1f, 0x3f, 0x7f, 0xff];

  return (requestedCount: number) => {
    let count = requestedCount;
    let result = 0;

    while (count > 0) {
      if (byteOffset >= bytes.length) fail("unexpected end of input");
      const bitsLeftInByte = 8 - bitOffset;

      if (count >= bitsLeftInByte) {
        result <<= bitsLeftInByte;
        result |= masks[bitsLeftInByte] & bytes[byteOffset];
        byteOffset += 1;
        bitOffset = 0;
        count -= bitsLeftInByte;
      } else {
        result <<= count;
        result |= (
          bytes[byteOffset]
          & (masks[count] << (8 - count - bitOffset))
        ) >> (8 - count - bitOffset);
        bitOffset += count;
        count = 0;
      }
    }

    return result;
  };
}

function readHeader(bits: BitReader) {
  if (bits(24) !== 4_348_520) fail("missing BZh magic number");
  const blockSize = bits(8) - 48;
  if (blockSize < 1 || blockSize > 9) fail("invalid block size");
  return blockSize;
}

function decompressBlock(
  context: BzipContext,
  bits: BitReader,
  emit: (byte: number) => void,
  buffer: Int32Array,
  bufferSize: number,
) {
  let blockMagic = "";
  for (let index = 0; index < 6; index += 1) {
    blockMagic += bits(8).toString(16);
  }

  if (blockMagic === "177245385090") return true;
  if (blockMagic !== "314159265359") fail("invalid block marker");

  bits(32); // Block CRC. The static payload is verified when generated.
  if (bits(1)) fail("obsolete randomized blocks are unsupported");

  const originalPointer = bits(24);
  if (originalPointer > bufferSize) fail("original pointer exceeds block size");

  const bitmap = bits(16);
  let symbolTotal = 0;
  for (let group = 0; group < 16; group += 1) {
    if ((bitmap & (1 << (15 - group))) === 0) continue;
    const subgroup = bits(16);
    for (let offset = 0; offset < 16; offset += 1) {
      if (subgroup & (1 << (15 - offset))) {
        context.symToByte[symbolTotal] = (16 * group) + offset;
        symbolTotal += 1;
      }
    }
  }

  const groupCount = bits(3);
  if (groupCount < 2 || groupCount > 6) fail("invalid Huffman group count");
  const selectorCount = bits(15);
  if (selectorCount === 0 || selectorCount > context.selectors.length) {
    fail("invalid selector count");
  }

  for (let index = 0; index < groupCount; index += 1) {
    context.mtfSymbol[index] = index;
  }

  for (let selectorIndex = 0; selectorIndex < selectorCount; selectorIndex += 1) {
    let moveIndex = 0;
    while (bits(1)) {
      moveIndex += 1;
      if (moveIndex >= groupCount) fail("selector exceeds group count");
    }

    const selected = context.mtfSymbol[moveIndex];
    for (let index = moveIndex - 1; index >= 0; index -= 1) {
      context.mtfSymbol[index + 1] = context.mtfSymbol[index];
    }
    context.mtfSymbol[0] = selected;
    context.selectors[selectorIndex] = selected;
  }

  const symbolCount = symbolTotal + 2;
  const groups: HuffmanGroup[] = [];
  const lengths = new Uint8Array(MAX_SYMBOLS);
  const temporary = new Uint8Array(MAX_HUFCODE_BITS + 1);

  for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
    let currentLength = bits(5);
    for (let symbolIndex = 0; symbolIndex < symbolCount; symbolIndex += 1) {
      while (true) {
        if (currentLength < 1 || currentLength > MAX_HUFCODE_BITS) {
          fail("invalid Huffman code length");
        }
        if (!bits(1)) break;
        currentLength += bits(1) ? -1 : 1;
      }
      lengths[symbolIndex] = currentLength;
    }

    let minLength = lengths[0];
    let maxLength = lengths[0];
    for (let symbolIndex = 1; symbolIndex < symbolCount; symbolIndex += 1) {
      minLength = Math.min(minLength, lengths[symbolIndex]);
      maxLength = Math.max(maxLength, lengths[symbolIndex]);
    }

    const huffmanGroup: HuffmanGroup = {
      permute: new Int32Array(MAX_SYMBOLS),
      limit: new Int32Array(MAX_HUFCODE_BITS + 1),
      base: new Int32Array(MAX_HUFCODE_BITS + 1),
      minLen: minLength,
      maxLen: maxLength,
    };
    groups[groupIndex] = huffmanGroup;

    const base = huffmanGroup.base.subarray(1);
    const limit = huffmanGroup.limit.subarray(1);
    let permutationIndex = 0;

    for (let length = minLength; length <= maxLength; length += 1) {
      for (let symbol = 0; symbol < symbolCount; symbol += 1) {
        if (lengths[symbol] === length) {
          huffmanGroup.permute[permutationIndex] = symbol;
          permutationIndex += 1;
        }
      }
    }

    for (let length = minLength; length <= maxLength; length += 1) {
      temporary[length] = 0;
      limit[length] = 0;
    }
    for (let symbol = 0; symbol < symbolCount; symbol += 1) {
      temporary[lengths[symbol]] += 1;
    }

    let codeLimit = 0;
    let accumulated = 0;
    for (let length = minLength; length < maxLength; length += 1) {
      codeLimit += temporary[length];
      limit[length] = codeLimit - 1;
      codeLimit <<= 1;
      accumulated += temporary[length];
      base[length + 1] = codeLimit - accumulated;
    }
    limit[maxLength] = codeLimit + temporary[maxLength] - 1;
    base[minLength] = 0;
  }

  for (let index = 0; index < 256; index += 1) {
    context.mtfSymbol[index] = index;
    context.byteCount[index] = 0;
  }

  let runPosition = 0;
  let outputCount = 0;
  let symbolsRemainingInGroup = 0;
  let selectorIndex = 0;
  let runLength = 0;
  let huffmanGroup = groups[0];
  let base = huffmanGroup.base.subarray(1);
  let limit = huffmanGroup.limit.subarray(1);

  while (true) {
    if (symbolsRemainingInGroup === 0) {
      symbolsRemainingInGroup = GROUP_SIZE;
      if (selectorIndex >= selectorCount) fail("selector overflow");
      huffmanGroup = groups[context.selectors[selectorIndex]];
      selectorIndex += 1;
      base = huffmanGroup.base.subarray(1);
      limit = huffmanGroup.limit.subarray(1);
    }
    symbolsRemainingInGroup -= 1;

    let codeLength = huffmanGroup.minLen;
    let code = bits(codeLength);
    while (true) {
      if (codeLength > huffmanGroup.maxLen) fail("invalid Huffman code");
      if (code <= limit[codeLength]) break;
      codeLength += 1;
      code = (code << 1) | bits(1);
    }

    const permutationIndex = code - base[codeLength];
    if (permutationIndex < 0 || permutationIndex >= MAX_SYMBOLS) {
      fail("invalid Huffman symbol");
    }
    const nextSymbol = huffmanGroup.permute[permutationIndex];

    if (nextSymbol === SYMBOL_RUNA || nextSymbol === SYMBOL_RUNB) {
      if (runPosition === 0) {
        runPosition = 1;
        runLength = 0;
      }
      runLength += nextSymbol === SYMBOL_RUNA ? runPosition : 2 * runPosition;
      runPosition <<= 1;
      continue;
    }

    if (runPosition) {
      runPosition = 0;
      if (outputCount + runLength >= bufferSize) fail("block output overflow");
      const repeatedByte = context.symToByte[context.mtfSymbol[0]];
      context.byteCount[repeatedByte] += runLength;
      while (runLength > 0) {
        buffer[outputCount] = repeatedByte;
        outputCount += 1;
        runLength -= 1;
      }
    }

    if (nextSymbol > symbolTotal) break;
    if (outputCount >= bufferSize) fail("block output overflow");

    const moveIndex = nextSymbol - 1;
    let movedSymbol = context.mtfSymbol[moveIndex];
    for (let index = moveIndex - 1; index >= 0; index -= 1) {
      context.mtfSymbol[index + 1] = context.mtfSymbol[index];
    }
    context.mtfSymbol[0] = movedSymbol;
    movedSymbol = context.symToByte[movedSymbol];
    context.byteCount[movedSymbol] += 1;
    buffer[outputCount] = movedSymbol;
    outputCount += 1;
  }

  if (originalPointer < 0 || originalPointer >= outputCount) {
    fail("invalid original pointer");
  }

  let cumulative = 0;
  for (let byte = 0; byte < 256; byte += 1) {
    const next = cumulative + context.byteCount[byte];
    context.byteCount[byte] = cumulative;
    cumulative = next;
  }

  for (let index = 0; index < outputCount; index += 1) {
    const byte = buffer[index] & 0xff;
    buffer[context.byteCount[byte]] |= index << 8;
    context.byteCount[byte] += 1;
  }

  let position = 0;
  let current = 0;
  let run = 0;
  if (outputCount) {
    position = buffer[originalPointer];
    current = position & 0xff;
    position >>= 8;
    run = -1;
  }

  while (outputCount > 0) {
    outputCount -= 1;
    const previous = current;
    position = buffer[position];
    current = position & 0xff;
    position >>= 8;

    let copies: number;
    let outputByte: number;
    if (run++ === 3) {
      copies = current;
      outputByte = previous;
      current = -1;
    } else {
      copies = 1;
      outputByte = current;
    }

    while (copies > 0) {
      emit(outputByte);
      copies -= 1;
    }
    if (current !== previous) run = 0;
  }

  return false;
}

export function decompressBzip2(input: Uint8Array) {
  const bits = createBitReader(input);
  const blockSize = readHeader(bits);
  const bufferSize = 100_000 * blockSize;
  const buffer = new Int32Array(bufferSize);
  const context: BzipContext = {
    byteCount: new Int32Array(256),
    symToByte: new Uint8Array(256),
    mtfSymbol: new Int32Array(256),
    selectors: new Uint8Array(0x8000),
  };
  const output: number[] = [];
  let complete = false;

  do {
    complete = decompressBlock(context, bits, (byte) => {
      if (output.length >= MAX_OUTPUT_BYTES) fail("output exceeds safety limit");
      output.push(byte);
    }, buffer, bufferSize);
  } while (!complete);

  return Uint8Array.from(output);
}
