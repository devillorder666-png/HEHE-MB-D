const { isEnglish } = require('./dictionary')

let games = {}
const LOBBY_TIME = 40000 // 40 sec to join
const TURN_TIME = 40000  // 40 sec to play

function clearTimers(g){
  if(g.lobbyTimer) clearTimeout(g.lobbyTimer)
  if(g.turnTimer) clearTimeout(g.turnTimer)
}
3
async function eliminatePlayer(conn, id, reason){
  let g = games[id]
  if(!g || !g.started) return
  const eliminated = g.players[g.current]
  await conn.sendMessage(id, {text: `⏰ @${eliminated.split('@')[0]} ${reason} — ELIMINATED!`, mentions: [eliminated]})
  g.players.splice(g.current,1)
  clearTimers(g)
  if(g.players.length === 1){
    await conn.sendMessage(id, {text: `🏆 WINNER IS @${g.players[0].split('@')[0]}! 🎉\nWords played: ${g.words.length}`, mentions: g.players})
    delete games[id]
    return
  }
  if(g.players.length === 0){
    await conn.sendMessage(id, {text: `Game ended, no players left.`})
    delete games[id]
    return
  }
  if(g.current >= g.players.length) g.current = 0
  startTurn(conn, id)
}

async function startTurn(conn, id){
  let g = games[id]
  if(!g) return
  clearTimers(g)
  const currentPlayer = g.players[g.current]
  const needLetter = g.lastLetter ? `Must start with *${g.lastLetter.toUpperCase()}*` : `Any English word`
  
  await conn.sendMessage(id, {
    text: `🎮 @${currentPlayer.split('@')[0]} YOUR TURN!\n${needLetter}\nYou have 40 seconds! ${g.words.length>0 ? `\nLast word: ${g.words[g.words.length-1]}` : ''}`,
    mentions: [currentPlayer]
  })

  g.turnTimer = setTimeout(() => {
    eliminatePlayer(conn, id, `did not play in 40 seconds`)
  }, TURN_TIME)
}

async function startGame(conn, id){
  let g = games[id]
  if(!g) return
  clearTimers(g)
  if(g.players.length < 2){
    await conn.sendMessage(id, {text: `❌ Not enough players. Need 2-8. Only ${g.players.length} joined. Game cancelled.\nSend .wc to start again.`})
    delete games[id]
    return
  }
  g.started = true
  g.words = []
  g.lastLetter = ''
  g.current = 0
  await conn.sendMessage(id, {text: `🚀 GAME STARTED with ${g.players.length} players!\n${g.players.map((p,i)=> `${i+1}. @${p.split('@')[0]}`).join('\n')}\n\nFirst player is @${g.players[0].split('@')[0]}!`, mentions: g.players})
  startTurn(conn, id)
}

module.exports = {
  name: 'wrchain',
  command: ['wrchain','wc','wordchain'],
  run: async (conn, m, args) => {
    const id = m.chat
    const sender = m.sender
    const text = (m.text || '').trim()
    const cmd = (args[0]||'').toLowerCase()

    // --- COMMANDS ---
    if(cmd === 'join'){
      let g = games[id]
      if(!g || g.started) return conn.sendMessage(id, {text: `No lobby open. Send .wc to create one.`})
      if(g.players.includes(sender)) return conn.sendMessage(id, {text: `You already joined @${sender.split('@')[0]}`, mentions:[sender]})
      if(g.players.length >= 8) return conn.sendMessage(id, {text: `Lobby full (8/8)`})
      g.players.push(sender)
      await conn.sendMessage(id, {text: `✅ @${sender.split('@')[0]} joined! (${g.players.length}/8)\nType .wrchain join to join!`, mentions:[sender, ...g.players]})
      if(g.players.length >= 8){
        await conn.sendMessage(id, {text: `Lobby full! Starting now...`})
        startGame(conn, id)
      }
      return
    }

    if(cmd === 'stop' || cmd === 'reset' || cmd === 'end'){
      clearTimers(games[id]||{})
      delete games[id]
      return conn.sendMessage(id, {text: `🛑 Game stopped.`})
    }

    if(cmd === 'status' || cmd === 'players'){
      let g = games[id]
      if(!g) return conn.sendMessage(id, {text: `No game.`})
      return conn.sendMessage(id, {text: `${g.started?'Game running':'Lobby'}: ${g.players.length} players\n${g.players.map(p=>`@${p.split('@')[0]}`).join(', ')}`, mentions: g.players})
    }

    // If message is a command (.wc) -> create lobby
    if(text.toLowerCase().startsWith('.wc') || text.toLowerCase().startsWith('.wrchain') || text.toLowerCase().startsWith('.wordchain')){
      // if no args, create lobby
      if(!cmd || cmd === 'join') {
        if(!games[id]){
          games[id] = {players:[sender], started:false, words:[], current:0, lastLetter:'', lobbyTimer:null, turnTimer:null}
          await conn.sendMessage(id, {text: `🎮 WORD CHAIN LOBBY CREATED!\n\n👤 Host: @${sender.split('@')[0]} (1/8)\n\n📝 Others type:\n.wrchain join\n\n⏳ Lobby closes in 40 seconds! Need 2-8 players.`, mentions:[sender]})
          games[id].lobbyTimer = setTimeout(()=> startGame(conn, id), LOBBY_TIME)
          return
        } else if(games[id].started){
          return conn.sendMessage(id, {text: `Game already running!`})
        } else {
          return // already in lobby, join handled above
        }
      }
      return
    }

    // --- GAMEPLAY (word attempt) ---
    let g = games[id]
    if(!g || !g.started) return

    // Only current player can play
    if(g.players[g.current] !== sender) return

    let word = text.split(/\s+/)[0].toLowerCase().trim()
    if(!word || word.startsWith('.')) return
    word = word.replace(/[^a-z]/g,'') // clean
    if(word.length < 2) return

    // FAIR JUDGING
    // 1. Is it English? (offline dict)
    if(!isEnglish(word)){
      clearTimers(g)
      await conn.sendMessage(id, {text: `❌ @${sender.split('@')[0]} "${word}" is NOT a valid English word! (Checked offline dictionary)\nELIMINATED!`, mentions:[sender]})
      g.players.splice(g.current,1)
      if(g.players.length === 1){
        await conn.sendMessage(id, {text: `🏆 WINNER IS @${g.players[0].split('@')[0]}! 🎉`, mentions:g.players})
        delete games[id]
        return
      }
      if(g.current >= g.players.length) g.current = 0
      startTurn(conn, id)
      return
    }

    // 2. Already used?
    if(g.words.includes(word)){
      clearTimers(g)
      await conn.sendMessage(id, {text: `❌ @${sender.split('@')[0]} "${word}" already used!\nELIMINATED!`, mentions:[sender]})
      g.players.splice(g.current,1)
      if(g.players.length === 1){
        await conn.sendMessage(id, {text: `🏆 WINNER IS @${g.players[0].split('@')[0]}!`, mentions:g.players})
        delete games[id]
        return
      }
      if(g.current >= g.players.length) g.current = 0
      startTurn(conn, id)
      return
    }

    // 3. Must start with last letter?
    if(g.lastLetter && !word.startsWith(g.lastLetter)){
      return conn.sendMessage(id, {text: `❌ @${sender.split('@')[0]} Must start with *${g.lastLetter.toUpperCase()}* not ${word[0].toUpperCase()}`, mentions:[sender]})
      // Don't eliminate for wrong letter, give another chance within 40 sec
    } else {
      // VALID!
      clearTimers(g)
      g.words.push(word)
      g.lastLetter = word.slice(-1)
      await conn.sendMessage(id, {text: `✅ *${word}* is VALID! (${g.words.length} words)\nNext letter: *${g.lastLetter.toUpperCase()}*`})
      g.current = (g.current + 1) % g.players.length
      startTurn(conn, id)
    }
  }
    }
