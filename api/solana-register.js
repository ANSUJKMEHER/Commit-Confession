import crypto from 'crypto'
import { Buffer } from 'buffer'

// Base58 Alphabet for decoding addresses and blockhashes
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

// Derive public key bytes from the private key seed using Node's native crypto
function getEd25519PublicKey(privateKeyDer) {
  const pkey = crypto.createPrivateKey({
    key: privateKeyDer,
    format: 'der',
    type: 'pkcs8'
  })
  const pubkeyObject = crypto.createPublicKey(pkey)
  // Export to raw public key buffer (32 bytes)
  const exported = pubkeyObject.export({ format: 'der', type: 'spki' })
  // The Ed25519 raw public key is the last 32 bytes of the SPKI format
  return exported.slice(exported.length - 32)
}

// Helper to make JSON-RPC calls to Solana Devnet
async function callSolanaRpc(method, params = []) {
  const r = await fetch('https://api.devnet.solana.com', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Math.floor(Math.random() * 1000000),
      method,
      params
    })
  })
  
  if (!r.ok) {
    throw new Error(`Solana Devnet RPC responded with status: ${r.status}`)
  }
  
  const data = await r.json()
  if (data.error) {
    throw new Error(data.error.message || `Solana RPC error calling ${method}`)
  }
  
  return data.result
}

// Cache the parsed authority details
let cachedSecretKey = null
let cachedPublicKeyBytes = null
let cachedPublicKeyBase58 = null
let cachedPrivateKeyDer = null

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' })
  }

  const { owner, repo, stats, alignment } = req.body || {}
  if (!owner || !repo || !stats || !alignment) {
    return res.status(400).json({ error: 'Missing required parameters' })
  }

  try {
    // Parse keypair from environment once
    if (!cachedSecretKey) {
      if (process.env.SOLANA_PAYER_KEY) {
        try {
          let cleanKey = process.env.SOLANA_PAYER_KEY.trim()
          if (cleanKey.startsWith('"') && cleanKey.endsWith('"')) {
            cleanKey = cleanKey.slice(1, -1)
          }
          if (cleanKey.startsWith("'") && cleanKey.endsWith("'")) {
            cleanKey = cleanKey.slice(1, -1)
          }
          const secretKey = Uint8Array.from(JSON.parse(cleanKey))
          const seed = Buffer.from(secretKey.slice(0, 32))
          
          const derHeader = Buffer.from([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20])
          cachedPrivateKeyDer = Buffer.concat([derHeader, seed])
          cachedPublicKeyBytes = getEd25519PublicKey(cachedPrivateKeyDer)
          cachedPublicKeyBase58 = encodeBase58(cachedPublicKeyBytes)
          cachedSecretKey = secretKey
        } catch (e) {
          console.error('Failed to parse SOLANA_PAYER_KEY, falling back to temp:', e)
        }
      }
      
      // Fallback if env key missing or failed to parse
      if (!cachedSecretKey) {
        throw new Error('SOLANA_PAYER_KEY environment variable is missing or invalid.')
      }
    }

    const payerPubkeyBytes = cachedPublicKeyBytes
    const addressStr = cachedPublicKeyBase58
    const privateKeyObj = crypto.createPrivateKey({
      key: cachedPrivateKeyDer,
      format: 'der',
      type: 'pkcs8'
    })

    // 1. Get Wallet Balance (in Lamports)
    let balance = 0
    try {
      const balanceData = await callSolanaRpc('getBalance', [addressStr, { commitment: 'confirmed' }])
      balance = balanceData.value ?? 0
    } catch (e) {
      console.warn('Failed to fetch balance, assuming 0:', e.message)
    }

    // 2. Request Devnet Airdrop if balance is very low (less than 0.005 SOL)
    if (balance < 5000000) {
      try {
        console.log(`System wallet balance low (${balance} lamports). Requesting airdrop...`)
        const airdropSig = await callSolanaRpc('requestAirdrop', [addressStr, 100000000]) // 0.1 SOL
        
        // Wait and confirm airdrop
        let confirmed = false
        for (let attempt = 0; attempt < 8; attempt++) {
          await new Promise((r) => setTimeout(r, 1000))
          const sigStatus = await callSolanaRpc('getSignatureStatuses', [[airdropSig]])
          if (sigStatus && sigStatus.value && sigStatus.value[0] && sigStatus.value[0].confirmationStatus === 'confirmed') {
            confirmed = true
            break
          }
        }
        if (confirmed) {
          console.log('Airdrop confirmed!')
          const balanceData = await callSolanaRpc('getBalance', [addressStr, { commitment: 'confirmed' }])
          balance = balanceData.value ?? 0
        }
      } catch (airdropErr) {
        console.warn('Airdrop request rate-limited or failed:', airdropErr.message)
      }
    }

    // If still no balance, return the friendly rateLimited response
    if (balance < 5000) {
      return res.status(200).json({
        rateLimited: true,
        address: addressStr,
        message: `System Devnet faucet rate-limited. Please airdrop a small amount of Devnet SOL to ${addressStr} at faucet.solana.com to activate on-chain registry.`
      })
    }

    // 3. Get latest blockhash
    const blockhashData = await callSolanaRpc('getLatestBlockhash')
    const { blockhash } = blockhashData.value

    // 4. Define Memo program text payload
    const memoData = JSON.stringify({
      app: 'Commit Confessions',
      repo: `${owner}/${repo}`,
      commits: stats.totalCommits,
      alignment: alignment,
      rage: stats.ragePct ?? 0,
      timestamp: new Date().toISOString(),
    })

    const memoBytes = Buffer.from(memoData, 'utf-8')
    const memoLengthBytes = encodeCompactU16(memoBytes.length)
    const memoProgramPubkeyBytes = decodeBase58('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')

    // 5. Construct transaction message bytes manually
    const messageBuffer = Buffer.concat([
      Buffer.from([1, 0, 1]), // header: 1 sig, 0 read-only signed, 1 read-only unsigned
      Buffer.from([2]), // accountKeysLength: 2
      payerPubkeyBytes, // 32 bytes
      memoProgramPubkeyBytes, // 32 bytes
      decodeBase58(blockhash), // 32 bytes
      Buffer.from([1]), // instructionsLength: 1
      Buffer.from([1]), // programIdIndex: 1 (Memo program)
      Buffer.from([1]), // accountsLength: 1
      Buffer.from([0]), // accounts: [0] (Payer signs)
      memoLengthBytes, // dataLength
      memoBytes // data
    ])

    // Sign the transaction message using Ed25519
    const signatureBytes = crypto.sign(null, messageBuffer, privateKeyObj)

    // Construct Serialized Transaction
    const transactionBuffer = Buffer.concat([
      Buffer.from([1]), // signaturesLength: 1
      signatureBytes, // 64 bytes
      messageBuffer // message bytes
    ])

    const base64Tx = transactionBuffer.toString('base64')

    // 6. Send transaction with skipPreflight enabled
    const signature = await callSolanaRpc('sendTransaction', [
      base64Tx,
      { encoding: 'base64', skipPreflight: true }
    ])

    // 7. Confirm transaction (non-blocking verification loop)
    let txConfirmed = false
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise((r) => setTimeout(r, 1000))
      const sigStatus = await callSolanaRpc('getSignatureStatuses', [[signature]])
      if (sigStatus && sigStatus.value && sigStatus.value[0] && sigStatus.value[0].confirmationStatus === 'confirmed') {
        txConfirmed = true
        break
      }
    }

    const solscanUrl = `https://solscan.io/tx/${signature}?cluster=devnet`

    return res.status(200).json({
      signature,
      solscanUrl,
      address: addressStr,
    })
  } catch (err) {
    console.error(err)
    return res.status(200).json({ error: `Solana Registry failed: ${err.message}` })
  }
}
