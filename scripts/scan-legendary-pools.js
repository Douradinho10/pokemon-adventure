const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname,'..')
const dataPath = path.join(repo,'data','pokemonData.ts')
const evoPath = path.join(repo,'data','pokedex','evolution-rules.generated.json')

const src = fs.readFileSync(dataPath,'utf8')
const evolutionRules = JSON.parse(fs.readFileSync(evoPath,'utf8'))

// crude extract wildPokemon block
const startMarker = 'export const wildPokemon'
const si = src.indexOf(startMarker)
if (si === -1) { console.error('wildPokemon not found'); process.exit(1) }
const bi = src.indexOf('{', si)
let i = bi+1, depth=1, end=-1
for (; i<src.length; i++){ if (src[i]==='{') depth++; else if (src[i]==='}') { depth--; if (depth===0){ end=i; break } } }
const objText = src.slice(bi+1,end)

const LEGENDARY = new Set([
  "Articuno","Zapdos","Moltres","Mewtwo","Mew","Lugia","HoOh","Raikou","Entei","Suicune","Celebi",
  "Regirock","Regice","Registeel","Latias","Latios","Kyogre","Groudon","Rayquaza","Jirachi","Deoxys",
  "Uxie","Mesprit","Azelf","Dialga","Palkia","Giratina","Heatran","Regigigas","Cresselia","Phione","Manaphy","Darkrai","Shaymin","Arceus",
  "Victini","Cobalion","Terrakion","Virizion","Tornadus","Thundurus","Landorus","Reshiram","Zekrom","Kyurem","Keldeo","Meloetta","Genesect",
  "Xerneas","Yveltal","Zygarde","Diancie","Hoopa","Volcanion","Type_Null","Silvally","Tapu_Koko","Tapu_Lele","Tapu_Bulu","Tapu_Fini",
  "Cosmog","Cosmoem","Solgaleo","Lunala","Necrozma","Magearna","Marshadow","Zacian","Zamazenta","Eternatus","Kubfu","Urshifu","Zarude",
  "Regieleki","Regidrago","Glastrier","Spectrier","Calyrex","Koraidon","Miraidon"
])

let pos=0
const found=[]
while (pos<objText.length){
  while (pos<objText.length && /\s/.test(objText[pos])) pos++
  const nameStart = pos
  while (pos<objText.length && /[A-Za-z0-9_]/.test(objText[pos])) pos++
  if (pos===nameStart) break
  const name = objText.slice(nameStart,pos)
  while (pos<objText.length && objText[pos] !== '{') pos++
  if (pos>=objText.length) break
  let ld=0, bs=pos
  while (pos<objText.length){ if (objText[pos]==='{') ld++; else if (objText[pos]==='}') { ld--; if (ld===0) { pos++; break } } pos++ }
  const block = objText.slice(bs,pos)
  const rarityMatch = block.match(/rarity:\s*"([^"']+)"/) || block.match(/rarity:\s*'([^']+)'/)
  const rarity = rarityMatch ? rarityMatch[1] : null
  if (LEGENDARY.has(name) && rarity !== 'lendario') found.push({name, rarity})
}

// compute minWildLevel via evolution rules
const species = Object.keys(evolutionRules).concat(Object.keys(evolutionRules).map(k=>evolutionRules[k].evolvesTo)).filter(Boolean)
const unique = Array.from(new Set(species))

function buildMinWildLevel(){
  const cache = {}
  const visiting = new Set()
  function resolve(s){
    if (cache[s]) return cache[s]
    if (visiting.has(s)) return 1
    visiting.add(s)
    const pre = Object.keys(evolutionRules).filter(k=>evolutionRules[k].evolvesTo===s)
    const levels = pre.map(p=>Math.max(typeof evolutionRules[p].level==='number'?evolutionRules[p].level:1, resolve(p)))
    visiting.delete(s)
    const min = levels.length?Math.max(...levels):1
    cache[s]=min
    return min
  }
  unique.forEach(u=>resolve(u))
  return cache
}
const minWild = buildMinWildLevel()

const lowLegends = []
for (const l of Object.keys(minWild)){ if (LEGENDARY.has(l) && (minWild[l] || 1) <= 10) lowLegends.push({name:l,min:minWild[l]}) }

console.log('legendary mislabelled in wildPokemon:', found)
console.log('legendary with minWildLevel<=10:', lowLegends)
process.exit(0)
