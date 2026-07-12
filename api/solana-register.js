import { Connection, Keypair, Transaction, TransactionInstruction, PublicKey } from '@solana/web3.js'
import { Buffer } from 'buffer'
// Persistent system keypair cached in memory across API requests.
// In a serverless environment, this persists as long as the container is warm.
let systemPayer = null

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' })
  }

  const { owner, repo, stats, alignment } = req.body || {}
  if (!owner || !repo || !stats || !alignment) {
    return res.status(400).json({ error: 'Missing required parameters' })
  }

  try {
    // Connect to Solana Devnet RPC
    const connection = new Connection('https://api.devnet.solana.com', {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 8000
    })

    // Initialize or retrieve the system keypair
    if (!systemPayer) {
      // Check if there is a pre-funded keypair in the environment
      if (process.env.SOLANA_PAYER_KEY) {
        try {
          const secretKey = Uint8Array.from(JSON.parse(process.env.SOLANA_PAYER_KEY))
          systemPayer = Keypair.fromSecretKey(secretKey)
        } catch (e) {
          console.error('Failed to parse SOLANA_PAYER_KEY:', e)
          systemPayer = Keypair.generate()
        }
      } else {
        systemPayer = Keypair.generate()
      }
    }

    // Check balance of system payer (1 SOL = 1,000,000,000 lamports)
    let balance = 0
    try {
      balance = await connection.getBalance(systemPayer.publicKey)
    } catch (e) {
      console.warn('Failed to fetch balance, assuming 0')
    }

    // If balance is low (less than 0.005 SOL), request an airdrop to top up
    if (balance < 5000000) {
      try {
        console.log(`System wallet balance low (${balance} lamports). Requesting airdrop for ${systemPayer.publicKey.toBase58()}...`)
        const airdropSig = await connection.requestAirdrop(systemPayer.publicKey, 100000000) // 0.1 SOL
        const latestBlockHash = await connection.getLatestBlockhash()
        await connection.confirmTransaction({
          blockhash: latestBlockHash.blockhash,
          lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
          signature: airdropSig,
        })
        console.log('Airdrop confirmed!')
      } catch (airdropErr) {
        console.warn('Airdrop request rate-limited or failed:', airdropErr.message)
      }
    }

    const payer = systemPayer

    // Refetch balance to see if airdrop succeeded or if we have existing balance
    let finalBalance = 0
    try {
      finalBalance = await connection.getBalance(payer.publicKey)
    } catch (e) {
      finalBalance = balance
    }

    if (finalBalance < 5000) {
      return res.status(200).json({
        rateLimited: true,
        address: payer.publicKey.toBase58(),
        message: `System Devnet faucet rate-limited. Please airdrop a small amount of Devnet SOL to ${payer.publicKey.toBase58()} at faucet.solana.com to activate on-chain registry.`
      })
    }

    // Define Memo program text payload (JSON string containing the proof details)
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

    const transaction = new Transaction().add(instruction)
    const signature = await connection.sendTransaction(transaction, [payer])

    const latestBlockHash = await connection.getLatestBlockhash()
    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: signature,
    })

    const solscanUrl = `https://solscan.io/tx/${signature}?cluster=devnet`

    return res.status(200).json({
      signature,
      solscanUrl,
      address: payer.publicKey.toBase58(),
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: `Solana Registry failed: ${err.message}` })
  }
}
