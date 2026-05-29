const fs = require('fs')
const path = require('path')

const repoRoot = path.join(__dirname, '..')
const dataDir = path.join(repoRoot, 'data', 'pokedex')
const generatedFile = path.join(dataDir, 'wild-types.generated.json')

const genFiles = ['gen1', 'gen2', 'gen3', 'gen4', 'gen5', 'gen6', 'gen7', 'gen8', 'gen9']

if (!fs.existsSync(generatedFile)) {
  console.error('Missing generated wild types file:', path.relative(repoRoot, generatedFile))
  process.exit(1)
}

const wildTypes = JSON.parse(fs.readFileSync(generatedFile, 'utf8'))
const species = new Set()

for (const gen of genFiles) {
  const file = path.join(dataDir, `${gen}.json`)
  if (!fs.existsSync(file)) continue
  const list = JSON.parse(fs.readFileSync(file, 'utf8'))
  list.forEach((name) => species.add(name))
}

const missing = []
for (const name of species) {
  if (!wildTypes[name]) {
    missing.push(name)
  }
}

console.log('totalSpecies:', species.size)
console.log('generatedTypes:', Object.keys(wildTypes).length)
console.log('missingCount:', missing.length)

const samples = ['Cacnea', 'Cacturne', 'Scorbunny', 'Raboot', 'Bulbasaur', 'Pikachu']
for (const sample of samples) {
  if (wildTypes[sample]) {
    console.log(`${sample}: ${wildTypes[sample]}`)
  }
}

if (missing.length > 0) {
  console.log('missing:', missing.slice(0, 50).join(', '))
  process.exit(1)
}
