const fs = require('fs')
const path = require('path')

const dataDir = path.join(__dirname, '..', 'data', 'pokedex')
const genFiles = ['gen1','gen2','gen3','gen4','gen5','gen6','gen7','gen8','gen9']

let genSpecies = new Set()
for (const gen of genFiles) {
  const file = path.join(dataDir, `${gen}.json`)
  if (!fs.existsSync(file)) continue
  try {
    const arr = JSON.parse(fs.readFileSync(file, 'utf8'))
    arr.forEach((n) => genSpecies.add(n))
  } catch (e) {}
}

const dataFile = path.join(__dirname, '..', 'data', 'pokemonData.ts')
const dataContent = fs.readFileSync(dataFile, 'utf8')

// Robustly extract the evolutionRules block by finding the 'const evolutionRules' token
// Allow optional quotes around the key and be permissive; do a global search (no line anchor)
const keyValueRegex = /(?:["']?)([^\n:\"']+?)(?:["']?)\s*:\s*\{[\s\S]*?evolvesTo\s*:\s*["']([^"']+)["']/g
let m
const keys = new Set()
const values = new Set()
while ((m = keyValueRegex.exec(dataContent))) {
  const key = m[1].trim()
  const val = m[2].trim()
  keys.add(key)
  values.add(val)
}

const unreferenced = []
for (const s of Array.from(genSpecies).sort()) {
  if (!keys.has(s) && !values.has(s)) {
    unreferenced.push(s)
  }
}

console.log('genSpeciesCount:', genSpecies.size)
console.log('evolutionRulesKeys:', keys.size, 'values:', values.size)
console.log('unreferencedCandidatesCount:', unreferenced.length)
console.log(unreferenced.join('\n'))

// Build conservative candidate pairs by checking adjacent entries in generation lists
const candidates = []
for (const gen of genFiles) {
  const file = path.join(dataDir, `${gen}.json`)
  if (!fs.existsSync(file)) continue
  try {
    const arr = JSON.parse(fs.readFileSync(file, 'utf8'))
    for (let i = 0; i < arr.length - 1; i++) {
      const a = arr[i]
      const b = arr[i + 1]
      if (!a || !b) continue
      // if a is not a key in evolutionRules and a could evolve to b (b not referenced), suggest a->b
      if (!keys.has(a) && !values.has(a) && !keys.has(b) && !values.has(b)) {
        // both unreferenced, skip
        continue
      }

      // If b is referenced as an evolvesTo target but no key maps to it, suggest mapping a->b
      if (!keys.has(a) && values.has(b) && !keys.has(b)) {
        candidates.push({ from: a, to: b, gen })
      }

      // If a is referenced as key mapping to something else, skip
      // Also if b already a key, skip
    }
  } catch (e) {}
}

// Deduplicate candidates
const uniq = {}
candidates.forEach((c) => { uniq[`${c.from}→${c.to}`] = c })
const candidateList = Object.values(uniq)
const outDir = path.join(__dirname, '..', '.tmp')
try { fs.mkdirSync(outDir, { recursive: true }) } catch(e) {}
fs.writeFileSync(path.join(outDir, 'missing-evolutions.json'), JSON.stringify({ genSpeciesCount: genSpecies.size, evolutionRulesKeys: Array.from(keys), evolutionRulesValues: Array.from(values), unreferenced, candidateList }, null, 2))

console.log('wrote .tmp/missing-evolutions.json')

// Also output species that appear as evolvesTo but whose pre-evo key is missing (reverse lookup)
const targets = new Set()
for (const v of values) targets.add(v)
const missingPreEvo = []
for (const t of targets) {
  // find any key that maps to t; we already have values set, but check if any key maps (should be yes)
  // If t exists in values but there is no corresponding key that maps to some t? skip
}

process.exit(0)
