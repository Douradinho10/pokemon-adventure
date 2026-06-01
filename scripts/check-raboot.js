const fs = require('fs')
const path = require('path')

const repo = path.resolve(__dirname, '..')
const genFiles = [
  'data/pokedex/gen1.json',
  'data/pokedex/gen2.json',
  'data/pokedex/gen3.json',
  'data/pokedex/gen4.json',
  'data/pokedex/gen5.json',
  'data/pokedex/gen6.json',
  'data/pokedex/gen7.json',
  'data/pokedex/gen8.json',
  'data/pokedex/gen9.json',
]

const evolutionRules = JSON.parse(fs.readFileSync(path.join(repo, 'data/pokedex/evolution-rules.generated.json'), 'utf8'))

const speciesSet = new Set()
for (const f of genFiles) {
  const p = path.join(repo, f)
  if (!fs.existsSync(p)) continue
  const arr = JSON.parse(fs.readFileSync(p, 'utf8'))
  arr.forEach((n) => speciesSet.add(n))
}

const speciesNames = Array.from(speciesSet)

const buildMinWildLevelBySpecies = () => {
  const cache = new Map()
  const visiting = new Set()

  const resolveMinLevel = (species) => {
    if (cache.has(species)) return cache.get(species)
    if (visiting.has(species)) return 1
    visiting.add(species)

    const preEvolutionLevels = speciesNames
      .map((candidate) => {
        const candidateRule = evolutionRules[candidate]
        if (!candidateRule || candidateRule.evolvesTo !== species) return null
        const preMin = resolveMinLevel(candidate)
        const candLevel = typeof candidateRule.level === 'number' ? candidateRule.level : 1
        return Math.max(candLevel, preMin)
      })
      .filter((v) => v !== null)

    visiting.delete(species)
    const minLevel = preEvolutionLevels.length > 0 ? Math.max(...preEvolutionLevels) : 1
    cache.set(species, minLevel)
    return minLevel
  }

  const result = {}
  speciesNames.forEach((s) => (result[s] = resolveMinLevel(s)))
  return result
}

const minWild = buildMinWildLevelBySpecies()

const getSpeciesAtLevel = (speciesName, level) => {
  if ((minWild[speciesName] || 1) <= level) return speciesName
  let current = speciesName
  const maxIter = Object.keys(minWild).length + 5
  let iter = 0
  while (iter++ < maxIter) {
    let found = null
    for (const candidate of Object.keys(minWild)) {
      const rule = evolutionRules[candidate]
      if (rule && rule.evolvesTo === current) {
        const candMin = minWild[candidate] || 1
        if (candMin <= level) {
          if (!found || (minWild[found] || 1) < candMin) {
            found = candidate
          }
        }
      }
    }
    if (!found) break
    current = found
    if ((minWild[current] || 1) <= level) return current
  }

  if ((minWild[speciesName] || 1) <= level) return speciesName
  const entries = Object.entries(minWild).sort((a, b) => (a[1] || 1) - (b[1] || 1))
  return entries.length > 0 ? entries[0][0] : speciesName
}

const probeLevels = [1,5,10,15,16,20,34,35]

console.log('Raboot minLevel:', minWild['Raboot'])
console.log('Scorbunny minLevel:', minWild['Scorbunny'])
console.log('Cinderace minLevel:', minWild['Cinderace'])
console.log('--- getSpeciesAtLevel for Raboot ---')
for (const l of probeLevels) {
  console.log('level', l, '=>', getSpeciesAtLevel('Raboot', l))
}

console.log('\n--- quick scan: species with minLevel <=5 that have evolutions ---')
for (const [s, lvl] of Object.entries(minWild)) {
  if (lvl <= 5 && evolutionRules[s]) {
    console.log(s, 'min', lvl, 'evolvesTo', evolutionRules[s].evolvesTo, 'at', evolutionRules[s].level)
  }
}
