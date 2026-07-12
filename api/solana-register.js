import { Keypair, Transaction, TransactionInstruction, PublicKey } from '@solana/web3.js'
import { Buffer } from 'buffer'

// Persistent system keypair cached in memory across API requests.
let systemPayer = null

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' })
  }

  const { owner, repo, stats, alignment } = req.body || {}
  if (!owner || !repo || !stats || !alignment) {
    return res.status(400).json({ error: 'Missing required parameters' })
  }

  try {
    // Initialize or retrieve the system keypair
    if (!systemPayer) {
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
          systemPayer = Keypair.fromSecretKey(secretKey)
        } catch (e) {
          console.error('Failed to parse SOLANA_PAYER_KEY:', e)
          systemPayer = Keypair.generate()
        }
      } else {
        systemPayer = Keypair.generate()
      }
    }

    const payer = systemPayer
    const addressStr = payer.publicKey.toBase58()

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
          // Fetch balance again
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

    // 4. Define Memo program text payload (JSON string containing the proof details)
    const memoData = JSON.stringify({
      app: 'Commit Confessions',
      repo: `${owner}/${repo}`,
      commits: stats.totalCommits,
      alignment: alignment,
      rage: stats.ragePct ?? 0,
      timestamp: new Date().toISOString(),
    })

    // Construct the Memo instruction (Memo program address is standard)
    const memoProgramId = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')
    const instruction = new TransactionInstruction({
      keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: false }],
      programId: memoProgramId,
      data: Buffer.from(memoData, 'utf-8'),
    })

    // Build, sign, and serialize transaction
    const transaction = new Transaction()
    transaction.add(instruction)
    transaction.recentBlockhash = blockhash
    transaction.feePayer = payer.publicKey
    
    // Sign transaction with system payer keypair
    transaction.sign(payer)
    
    // Serialize transaction to base64
    const base64Tx = transaction.serialize().toString('base64')

    // 5. Send transaction with skipPreflight enabled
    const signature = await callSolanaRpc('sendTransaction', [
      base64Tx,
      { encoding: 'base64', skipPreflight: true }
    ])

    // 6. Confirm transaction (non-blocking verification loop)
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
