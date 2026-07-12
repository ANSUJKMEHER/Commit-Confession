import { Connection, Keypair, Transaction, TransactionInstruction, PublicKey } from '@solana/web3.js'

// System wallet keypair. Devnet SOL is free, so we can hardcode a temporary keypair
// or load it from the environment. To ensure it works out of the box, we can generate a keypair
// and request an airdrop on demand, or use a system keypair.
// For zero-config local testing, we generate a keypair and request a Devnet airdrop on the fly!
// This makes it completely zero-setup for the user.

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
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed')

    // Generate a temporary execution authority keypair
    const payer = Keypair.generate()

    // Request a small Devnet airdrop to pay for the transaction fees (~0.005 SOL is plenty)
    try {
      const airdropSig = await connection.requestAirdrop(payer.publicKey, 10000000) // 0.01 SOL
      const latestBlockHash = await connection.getLatestBlockhash()
      await connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: airdropSig,
      })
    } catch (airdropErr) {
      console.warn('Airdrop failed, attempting transaction anyway:', airdropErr.message)
      // Devnet faucets are sometimes rate-limited. In production, you would use a pre-funded keypair.
    }

    // Define Memo program text payload (JSON string containing the proof details)
    const memoData = JSON.stringify({
      app: 'Commit Confessions',
      repo: `${owner}/${repo}`,
      commits: stats.totalCommits,
      alignment: alignment,
      rage: stats.ragePct,
      timestamp: new Date().toISOString(),
    })

    // Construct the Memo instruction (Memo program address is standard)
    const memoProgramId = new PublicKey('MemoSgmgqmqfQMw7sFU7urU17Z5FRJ6296Qn67FFu1f')
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
