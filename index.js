const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const P = require('pino')
const express = require('express')
const fs = require('fs')
const app = express()
const PORT = 3000
global.OWNER = ['256792930216']
global.wordchainGames = {}
global.lastPairCode = 'Wait 10s...'

app.use(express.urlencoded({extended:true}))
app.use(express.json())
app.get('/', (req,res)=>{ res.send(`<h1>HEHE MB D</h1><h2>Code: ${global.lastPairCode}</h2><p>If code not showing, check Termux logs</p>`) })

function loadPlugins(){ let plugins={}; fs.readdirSync('./plugins').forEach(f=>{ if(f.endsWith('.js')){ try{ let p=require(`./plugins/${f}`); plugins[p.name]=p; if(p.alias) p.alias.forEach(a=> plugins[a]=p) }catch(e){ console.log('Plugin error',f,e.message) } } }); return plugins }

async function startBot(){
  console.log('Starting bot...')
  const { state, saveCreds } = await useMultiFileAuthState('./session')
  const sock = makeWASocket({ auth: state, logger: P({level:'silent'}), browser: ['Ubuntu','Chrome','20.0'], markOnlineOnConnect: true })
  global.sock=sock
  sock.ev.on('creds.update', saveCreds)

  if(!state.creds.registered){
    console.log('Not registered, will request pairing code in 5 sec for 256779997074...')
    setTimeout(async()=>{
      try{
        let num = '256779997074'
        console.log('Requesting code for', num)
        let code = await sock.requestPairingCode(num)
        global.lastPairCode = code
        console.log('============================')
        console.log('PAIR CODE FOR', num, ':', code)
        console.log('============================')
        console.log('Go to WhatsApp > Linked devices > Link with phone number > enter this code')
      }catch(e){
        console.log('PAIR ERROR:', e.message)
        console.log('Try again in 20 sec...')
        setTimeout(async()=>{
          try{ let c=await sock.requestPairingCode('256779997074'); global.lastPairCode=c; console.log('CODE RETRY:',c) }catch(er){ console.log(er.message) }
        },20000)
      }
    },5000)
  }

  let plugins=loadPlugins()
  console.log('Plugins loaded:', Object.keys(plugins))

  sock.ev.on('connection.update', d=>{
    console.log('Connection:', d.connection)
    if(d.connection==='open'){ console.log('✅ HEHE MB D Connected!'); global.lastPairCode='Connected ✅' }
    if(d.connection==='close'){
      let reason = d.lastDisconnect?.error?.output?.statusCode
      console.log('Closed reason:', reason, d.lastDisconnect?.error?.message)
      if(reason !== DisconnectReason.loggedOut) startBot()
    }
  })

  sock.ev.on('messages.upsert', async({messages})=>{
    let m=messages[0]; if(!m.message) return
    let from=m.key.remoteJid
    let body=m.message.conversation || m.message.extendedTextMessage?.text || ''
    if(!body.startsWith('.')){
      if(global.wcHandler) global.wcHandler(sock,from,m,body.trim().toLowerCase())
      return
    }
    let args=body.slice(1).trim().split(/ +/); let cmd=args.shift().toLowerCase()
    if(plugins[cmd]) plugins[cmd].run(m,{sock,args,from})
  })
}
startBot()
app.listen(PORT, ()=> console.log('Web server on http://localhost:'+PORT))
