export const KEY_LENGTH = 32
export const SEGMENT_SIZE = 8

export function sanitizeKey(value) {
  return value.replace(/[^01]/g, '').slice(0, KEY_LENGTH)
}

export function trimTextToBinaryLimit(value, limit = KEY_LENGTH) {
  let binaryCount = 0
  let output = ''

  for (const char of value) {
    const isBinaryChar = char === '0' || char === '1'

    if (isBinaryChar && binaryCount >= limit) {
      break
    }

    output += char

    if (isBinaryChar) {
      binaryCount += 1
    }
  }

  return output
}

export function generateRandomBinaryKey(length = KEY_LENGTH) {
  const randomBytes = new Uint8Array(length)
  crypto.getRandomValues(randomBytes)

  return Array.from(randomBytes, (byte) => (byte & 1).toString()).join('')
}

export function buildKeyBytes(binaryKey) {
  const bytes = []

  for (let index = 0; index < binaryKey.length; index += SEGMENT_SIZE) {
    bytes.push(Number.parseInt(binaryKey.slice(index, index + SEGMENT_SIZE), 2))
    console.log(bytes[index])
  }

  return bytes
}

function getBit(num, bitIndex) {
  return (num >>> bitIndex) & 1
}

function keyShift(key, index, bit) {
  const highBit = getBit(key[index], 7)
  key[index] = ((key[index] << 1) & 0xff) | bit

  if (index < key.length - 1) {
    key = keyShift(key, index + 1, highBit)
  }

  return key
}

export function xorEncryptBytes(sourceBytes, keyBytes) {
  const encryptedBytes = new Uint8Array(sourceBytes.length)
  let shiftCount = 0
  for (let index = 0; index < sourceBytes.length; index++) {
    const keyIndex = keyBytes.length - 1 -(index % keyBytes.length)
    encryptedBytes[index] = sourceBytes[index] ^ keyBytes[keyIndex]
    if (index % keyBytes.length === 3) {
      const bit1 = getBit(keyBytes[Math.floor(0/SEGMENT_SIZE)], 0%SEGMENT_SIZE)
      const bit27 = getBit(keyBytes[Math.floor(26/SEGMENT_SIZE)], 26%SEGMENT_SIZE)
      const bit28 = getBit(keyBytes[Math.floor(27/SEGMENT_SIZE)], 27%SEGMENT_SIZE)
      const bit32 = getBit(keyBytes[Math.floor(31/SEGMENT_SIZE)], 31%SEGMENT_SIZE)
      const newBit = bit1 ^ bit27 ^ bit28 ^ bit32

      keyBytes = keyShift(keyBytes, 0, newBit)
      shiftCount += 1
    }
  }

  return {
    bytes: encryptedBytes,
    shiftCount,
  }
}

export function bytesToHex(bytes, limit) {
  const slice = Array.from(bytes.slice(0, limit), (byte) => byte.toString(16).padStart(2, '0'))
  const output = slice.join(' ')

  if (!output) {
    return 'Пусто'
  }

  return bytes.length > limit ? `${output} ...` : output
}

export function formatBytes(value) {
  if (!Number.isFinite(value) || value < 1024) {
    return `${value || 0} B`
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export function isMostlyText(bytes) {
  let printable = 0

  for (const byte of bytes) {
    const isWhitespace = byte === 9 || byte === 10 || byte === 13
    const isAscii = byte >= 32 && byte <= 126
    const isExtended = byte >= 160

    if (isWhitespace || isAscii || isExtended) {
      printable += 1
    }
  }

  return printable / bytes.length > 0.84
}

export async function buildSourcePreview(file) {
  const slice = new Uint8Array(await file.slice(0, 192).arrayBuffer())

  return buildBytesPreview(slice)
}

export function buildBytesPreview(bytes) {
  const slice = bytes.slice(0, 192)

  if (!slice.length) {
    return 'Пусто'
  }

  if (isMostlyText(slice)) {
    const text = new TextDecoder('utf-8').decode(slice).replace(/\s+/g, ' ').trim()
    return text || 'Пусто'
  }

  return bytesToHex(slice, 48)
}

export function getResultFileName(fileName, mode) {
  if (mode === 'decrypt') {
    return fileName.endsWith('.enc') ? fileName.slice(0, -4) : `${fileName}.dec`
  }

  return `${fileName}.enc`
}

export async function transformFileData(file, binaryKey, mode = 'encrypt') {
  const sourceBytes = new Uint8Array(await file.arrayBuffer())
  const keyBytes = buildKeyBytes(binaryKey)
  const { bytes: resultBytes, shiftCount } = xorEncryptBytes(sourceBytes, keyBytes)
  const blob = new Blob([resultBytes], { type: 'application/octet-stream' })

  return {
    bytes: resultBytes,
    blob,
    fileName: getResultFileName(file.name, mode),
    preview: mode === 'decrypt' ? buildBytesPreview(resultBytes) : bytesToHex(resultBytes, 64),
    shiftCount,
  }
}
