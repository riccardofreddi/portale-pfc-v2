const fs = require('fs')
const p = 'src/components/pfc/cliente/ClienteCassetto.tsx'
let s = fs.readFileSync(p, 'utf8')
const o = [
  '            <p className="text-sm font-semibold text-slate-800">Cos’è il Cassetto Digitale?</p>',
  '            <p className="text-xs text-slate-600 leading-relaxed mt-0.5">',
  '              È il tuo spazio sicuro per QR P.IVA, visure, identità e IBAN. Carica un documento qui sopra e lo ritrovi subito, senza cercarlo tra le cartelle.',
  '            </p>'
].join('\n')
const n = [
  '            <p className="text-sm text-slate-600 leading-relaxed">',
  '              Carica i tuoi documenti essenziali e li ritrovi sempre qui.',
  '            </p>'
].join('\n')
if (!s.includes(o)) { console.error('BLOCCO NON TROVATO'); process.exit(1) }
s = s.replace(o, n)
fs.writeFileSync(p, s)
console.log('OK: frase unica cassetto')
