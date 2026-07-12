import fetch from 'node-fetch'

async function testSolana() {
  try {
    const res = await fetch('http://localhost:3000/api/solana-register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        owner: 'ANSUJKMEHER',
        repo: 'Commit-Confession',
        stats: {
          totalCommits: 116,
          longestStreak: 6,
          lateNightPct: 1,
          busiestHourLabel: '4pm'
        },
        alignment: 'Rage Coder'
      })
    })
    
    const data = await res.json()
    console.log('Solana Response:', data)
  } catch (err) {
    console.error('Test Failed:', err)
  }
}

testSolana()
