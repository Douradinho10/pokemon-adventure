const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname,'..')
const dataPath = path.join(repo,'data','pokemonData.ts')
const evoPath = path.join(repo,'data','pokedex','evolution-rules.generated.json')

const src = fs.readFileSync(dataPath,'utf8')
const evolutionRules = JSON.parse(fs.readFileSync(evoPath,'utf8'))

// extract wildPokemon object text
const startMarker = 'export const wildPokemon'
const si = src.indexOf(startMarker)
if (si === -1) { console.error('wildPokemon not found'); process.exit(1) }
const eq = src.indexOf('=', si)
const bi = src.indexOf('{', eq)
let i = bi+1, depth=1, end=-1
for (; i<src.length; i++){ if (src[i]==='{') depth++; else if (src[i]==='}') { depth--; if (depth===0){ end=i; break } } }
const objText = src.slice(bi+1,end)

// parse species blocks to extract rarity
let pos=0
const speciesInfo = {}
while (pos<objText.length){
  while (pos<objText.length && !/[A-Za-z0-9_]/.test(objText[pos])) pos++
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
  const rarity = rarityMatch ? rarityMatch[1] : 'comum'
  speciesInfo[name]= { rarity }
}

// build reverse evolution mapping (pre->to exists in evolutionRules)
const evolvesTo = evolutionRules
const preMap = {}
Object.keys(evolutionRules).forEach(k=>{
  const to = evolutionRules[k].evolvesTo
  if (!to) return
  preMap[to] = preMap[to] || []
  preMap[to].push(k)
})

// build minWildLevel cache
const cache = {}
const visiting = new Set()
function resolveMin(s){
  if (cache[s]) return cache[s]
  if (visiting.has(s)) return 1
  visiting.add(s)
  const pre = Object.keys(evolutionRules).filter(k=>evolutionRules[k].evolvesTo===s)
  const levels = pre.map(p=>Math.max(typeof evolutionRules[p].level==='number'?evolutionRules[p].level:1, resolveMin(p)))
  visiting.delete(s)
  const min = levels.length?Math.max(...levels):1
  cache[s]=min
  return min
}

const allSpecies = new Set([...Object.keys(speciesInfo), ...Object.keys(evolutionRules), ...Object.values(evolutionRules).map(v=>v.evolvesTo).filter(Boolean)])
Array.from(allSpecies).forEach(s=>resolveMin(s))

function getAncestoryChain(target){
  const chain = []
  // walk backwards to base (choose first pre-evolution if multiple)
  let cur = target
  chain.push(cur)
  while (true){
    const pres = Object.keys(evolutionRules).filter(k=>evolutionRules[k].evolvesTo===cur)
    if (!pres || pres.length===0) break
    // pick first
    cur = pres[0]
    chain.unshift(cur)
  }
  return chain
}

function getSpeciesAtLevel(species, level){
  if (!species) return species
  const chain = getAncestoryChain(species) // base..species
  // find last species in chain whose minWildLevel <= level
  let chosen = chain[chain.length-1]
  for (let i=chain.length-1;i>=0;i--){
    const s = chain[i]
    const min = cache[s] || 1
    if (min <= level){ chosen = s; break }
    // otherwise continue to earlier ancestor
    chosen = s
  }
  // if even base has min>level, return base
  return chosen
}

// build rarity pools
const pools = { comum: [], raro: [], lendario: [] }
Object.entries(speciesInfo).forEach(([name,info])=>{
  const r = info.rarity || 'comum'
  if (!pools[r]) pools[r]=[]
  pools[r].push(name)
})

console.log('pool sizes:', { comum: pools.comum.length, raro: pools.raro.length, lendario: pools.lendario.length })
// if any legends not present in pools but exist in evolutionRules and are lendario, include them
Object.keys(evolutionRules).forEach(k=>{
  // nothing
})

const rarityChances = { comum: 0.75, raro: 0.2, lendario: 0.05 }

function pickRarity(battleCount){
  // match client logic: legendary only on milestone battles, rare ~20%, else common
  if (battleCount > 0 && battleCount % 100 === 0) return 'lendario'
  return Math.random() < 0.2 ? 'raro' : 'comum'
}

// implement getScaledEnemyLevel similar to client
function getWaveLevelCap(battleCount){
  const wave = Math.max(1, battleCount)
  const tier = Math.floor((wave - 1)/10)
  return Math.min(100, Math.max(10, 10 + tier*7))
}
function clamp(v,min,max){ return Math.min(max, Math.max(min, v)) }
function getScaledEnemyLevel(battleCount){
  const nextWave = Math.max(1, battleCount + 1)
  const currentTier = Math.floor((nextWave - 1) / 10)
  const currentWaveCap = getWaveLevelCap(nextWave)
  const previousWaveCap = currentTier <= 0 ? 1 : getWaveLevelCap(currentTier * 10)
  const minLevel = Math.min(previousWaveCap, currentWaveCap)
  const maxLevel = Math.max(previousWaveCap, currentWaveCap)
  const startLevel = Math.max(minLevel, Math.floor(currentWaveCap / 2))
  const waveIndexInTier = ((nextWave - 1) % 10) + 1
  const t = (waveIndexInTier - 1) / Math.max(1, 10 - 1)
  const interpolated = Math.round(startLevel + (currentWaveCap - startLevel) * t)
  const jitter = Math.floor((Math.random()*3)-1)
  const candidate = Math.round(interpolated + jitter)
  return clamp(candidate, minLevel, maxLevel)
}

// simulate
const wavesToSimulate = 30
const perWave = 2000
const report = {}
for (let wave=1; wave<=wavesToSimulate; wave++){
  report[wave] = { encounters: 0, legendaryAppeared: 0, legendarySpecies: {} }
  for (let e=0;e<perWave;e++){
    const battleCount = wave-1
    const level = getScaledEnemyLevel(battleCount)
    const rarity = pickRarity(battleCount)
    const pool = pools[rarity] && pools[rarity].length? pools[rarity] : ([])
    if (pool.length===0){ continue }
    const specie = pool[Math.floor(Math.random()*pool.length)]
    const displayed = getSpeciesAtLevel(specie, level)
    report[wave].encounters++
    const displayedRarity = (speciesInfo[displayed] && speciesInfo[displayed].rarity) || 'comum'
    if (displayedRarity === 'lendario'){
      report[wave].legendaryAppeared++
      report[wave].legendarySpecies[displayed] = (report[wave].legendarySpecies[displayed]||0) + 1
    }
  }
}

// print summary
for (let wave=1; wave<=wavesToSimulate; wave++){
  const r = report[wave]
  console.log(`Wave ${wave}: encounters=${r.encounters}, legends=${r.legendaryAppeared}`)
  if (r.legendaryAppeared>0){
    const items = Object.entries(r.legendarySpecies).sort((a,b)=>b[1]-a[1]).slice(0,10)
    console.log('  sample legends:', items.map(([k,v])=>`${k}:${v}`).join(', '))
  }
}

// detect any legends in waves <=10
let early=0
for (let wave=1; wave<=10; wave++) early += report[wave].legendaryAppeared
console.log('\nTotal early legends (waves 1-10):', early)

process.exit(0)
