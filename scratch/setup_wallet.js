import { Keypair } from '@solana/web3.js'
import fs from 'fs'
import path from 'path'

function setupPersistentWallet() {
  const kp = Keypair.generate()
  const secretKeyString = JSON.stringify(Array.from(kp.secretKey))
  const publicKey = kp.publicKey.toBase58()
  
  console.log('Generated Keypair!')
  console.log('Public Key:', publicKey)
  
  const envPath = path.resolve(process.cwd(), '.env')
  let envContent = ''
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8')
  }
  
  // Append or replace
  if (envContent.includes('SOLANA_PAYER_KEY')) {
    envContent = envContent.replace(/SOLANA_PAYER_KEY=.*/, `SOLANA_PAYER_KEY=${secretKeyString}`)
  } else {
    envContent += `\nSOLANA_PAYER_KEY=${secretKeyString}\n`
  }
  
  fs.writeFileSync(envPath, envContent, 'utf8')
  console.log('Successfully appended SOLANA_PAYER_KEY to .env!')
}

setupPersistentWallet()
