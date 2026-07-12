import { Connection, PublicKey } from '@solana/web3.js'

async function fundWallet() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed')
  const pubkey = new PublicKey('Fn1gAZt1aWHSzJ7gmsDRGjxmPwxuHh3CaM5oVftGjbq1')
  
  console.log('Attempting to request small airdrop for Fn1gAZt1aWHSzJ7gmsDRGjxmPwxuHh3CaM5oVftGjbq1...')
  try {
    const sig = await connection.requestAirdrop(pubkey, 5000000) // 0.005 SOL
    const blockhash = await connection.getLatestBlockhash()
    await connection.confirmTransaction({
      blockhash: blockhash.blockhash,
      lastValidBlockHeight: blockhash.lastValidBlockHeight,
      signature: sig
    })
    console.log('Successfully funded! Current balance:', await connection.getBalance(pubkey), 'lamports')
  } catch (err) {
    console.error('Funding failed:', err.message)
  }
}

fundWallet()
