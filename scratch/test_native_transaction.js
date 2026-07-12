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

function encodeCompactU16(value) {
  const bytes = []
  while (true) {
    let elem = value & 0x7f
    value >>= 7
    if (value === 0) {
      bytes.push(elem)
      break
    } else {
      bytes.push(elem | 0x80)
    }
  }
  return Buffer.from(bytes)
}

async function callSolanaRpc(method, params = []) {
  const r = await fetch('https://api.devnet.solana.com', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params
    })
  })
  const data = await r.json()
  if (data.error) throw new Error(data.error.message)
  return data.result
}

async function testNativeTx() {
  try {
    const secretKey = Uint8Array.from([50,63,79,66,31,85,111,235,16,168,212,181,235,206,75,216,6,36,222,7,118,155,246,138,108,133,28,125,139,215,251,110,219,139,132,83,35,235,170,33,124,171,46,29,194,13,230,226,62,194,69,150,45,185,197,162,178,127,172,180,85,65,184,136])
    const seed = Buffer.from(secretKey.slice(0, 32))
    const payerPubkey = decodeBase58('Fn1gAZt1aWHSzJ7gmsDRGjxmPwxuHh3CaM5oVftGjbq1')
    const memoProgramPubkey = decodeBase58('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')
    
    // Fetch latest blockhash
    console.log('Fetching blockhash...')
    const blockhashData = await callSolanaRpc('getLatestBlockhash')
    const blockhash = blockhashData.value.blockhash
    console.log('Blockhash:', blockhash)

    // Build Memo Instruction Data
    const memoData = JSON.stringify({
      app: 'Commit Confessions Test',
      repo: 'ANSUJKMEHER/StreamSync',
      commits: 116,
      alignment: 'Rage Coder',
      rage: 35,
      timestamp: new Date().toISOString()
    })
    
    const memoBytes = Buffer.from(memoData, 'utf-8')
    const memoLengthBytes = encodeCompactU16(memoBytes.length)

    // Construct Message
    const messageBuffer = Buffer.concat([
      Buffer.from([1, 0, 1]), // header: 1 sig, 0 read-only signed, 1 read-only unsigned
      Buffer.from([2]), // accountKeysLength: 2
      payerPubkey, // 32 bytes
      memoProgramPubkey, // 32 bytes
      decodeBase58(blockhash), // 32 bytes
      Buffer.from([1]), // instructionsLength: 1
      Buffer.from([1]), // programIdIndex: 1 (Memo program)
      Buffer.from([1]), // accountsLength: 1
      Buffer.from([0]), // accounts: [0] (Payer signs)
      memoLengthBytes, // dataLength
      memoBytes // data
    ])

    // Sign message with Ed25519
    const derHeader = Buffer.from([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20])
    const privateKey = crypto.createPrivateKey({
      key: Buffer.concat([derHeader, seed]),
      format: 'der',
      type: 'pkcs8'
    })
    const signature = crypto.sign(null, messageBuffer, privateKey)

    // Construct Serialized Transaction
    const transactionBuffer = Buffer.concat([
      Buffer.from([1]), // signaturesLength: 1
      signature, // 64 bytes
      messageBuffer // message bytes
    ])

    const base64Tx = transactionBuffer.toString('base64')
    
    // Submit transaction
    console.log('Sending transaction...')
    const sig = await callSolanaRpc('sendTransaction', [base64Tx, { encoding: 'base64', skipPreflight: true }])
    console.log('Transaction Sent! Signature:', sig)
  } catch (err) {
    console.error('Test Failed:', err)
  }
}

testNativeTx()
