import crypto from 'crypto'

// Base58 Alphabet
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
function decodeBase58(string) {
  let buffer = [0]
  for (let i = 0; i < string.length; i++) {
    const char = string[i]
    let value = BASE58_ALPHABET.indexOf(char)
    if (value === -1) throw new Error('Invalid base58 character')
    for (let j = 0; j < buffer.length; j++) {
      value += buffer[j] * 58
      buffer[j] = value & 0xff
      value >>= 8
    }
    while (value > 0) {
      buffer.push(value & 0xff)
      value >>= 8
    }
  }
  for (let i = 0; string[i] === '1'; i++) {
    buffer.push(0)
  }
  return Buffer.from(buffer.reverse())
}

function encodeBase58(buffer) {
  let digits = [0]
  for (let i = 0; i < buffer.length; i++) {
    let value = buffer[i]
    for (let j = 0; j < digits.length; j++) {
      value += digits[j] << 8
      digits[j] = value % 58
      value = Math.floor(value / 58)
    }
    while (value > 0) {
      digits.push(value % 58)
      value = Math.floor(value / 58)
    }
  }
  let string = ''
  for (let i = 0; buffer[i] === 0; i++) {
    string += '1'
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    string += BASE58_ALPHABET[digits[i]]
  }
  return string
}

async function testNativeSign() {
  try {
    // Generate private key object
    const secretKey = Uint8Array.from([50,63,79,66,31,85,111,235,16,168,212,181,235,206,75,216,6,36,222,7,118,155,246,138,108,133,28,125,139,215,251,110,219,139,132,83,35,235,170,33,124,171,46,29,194,13,230,226,62,194,69,150,45,185,197,162,178,127,172,180,85,65,184,136])
    const seed = Buffer.from(secretKey.slice(0, 32))
    const pubkey = decodeBase58('Fn1gAZt1aWHSzJ7gmsDRGjxmPwxuHh3CaM5oVftGjbq1')
    
    // Construct PKCS#8 DER private key wrapper for Ed25519
    const derHeader = Buffer.from([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20])
    const privateKeyDer = Buffer.concat([derHeader, seed])
    const privateKey = crypto.createPrivateKey({
      key: privateKeyDer,
      format: 'der',
      type: 'pkcs8'
    })
    
    const message = Buffer.from('hello solana')
    const signature = crypto.sign(null, message, privateKey)
    
    console.log('Signature length:', signature.length)
    console.log('Signature Base58:', encodeBase58(signature))
  } catch (err) {
    console.error('Test Failed:', err)
  }
}

testNativeSign()
