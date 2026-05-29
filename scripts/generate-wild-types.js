const fs = require('fs')
const path = require('path')

const repoRoot = path.join(__dirname, '..')
const dataDir = path.join(repoRoot, 'data', 'pokedex')
const outputFile = path.join(dataDir, 'wild-types.generated.json')

const genFiles = ['gen1', 'gen2', 'gen3', 'gen4', 'gen5', 'gen6', 'gen7', 'gen8', 'gen9']

const normalizeComparable = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
const repoNameToSlug = (name) =>
  name
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9-]/g, '')

const typeLabels = {
  normal: 'Normal',
  fire: 'Fogo',
  water: 'Água',
  electric: 'Elétrico',
  grass: 'Grama',
  ice: 'Gelo',
  fighting: 'Lutador',
  poison: 'Veneno',
  ground: 'Terra',
  flying: 'Voador',
  psychic: 'Psíquico',
  bug: 'Inseto',
  rock: 'Pedra',
  ghost: 'Fantasma',
  dragon: 'Dragão',
  dark: 'Sombrio',
  steel: 'Aço',
  fairy: 'Fada',
}

const manualWildTypeOverrides = {
  Nidoran: 'Veneno',
  Deoxys: 'Psíquico',
  Wormadam: 'Inseto/Grama',
  Giratina: 'Fantasma/Dragão',
  Shaymin: 'Grama/Voador',
  Basculin: 'Água',
  Darmanitan: 'Fogo',
  Frillish: 'Água/Fantasma',
  Jellicent: 'Água/Fantasma',
  Tornadus: 'Voador',
  Thundurus: 'Elétrico/Voador',
  Landorus: 'Terra/Voador',
  Keldeo: 'Água/Lutador',
  Meloetta: 'Normal/Psíquico',
  Pyroar: 'Fogo/Normal',
  Meowstic: 'Psíquico',
  Aegislash: 'Aço/Fantasma',
  Pumpkaboo: 'Fantasma/Grama',
  Gourgeist: 'Fantasma/Grama',
  Zygarde: 'Dragão/Terra',
  Oricorio: 'Fogo/Voador',
  Lycanroc: 'Pedra',
  Wishiwashi: 'Água',
  Minior: 'Pedra/Voador',
  Mimikyu: 'Fantasma/Fada',
  Toxtricity: 'Elétrico/Veneno',
  Eiscue: 'Gelo',
  Indeedee: 'Psíquico/Normal',
  Morpeko: 'Elétrico/Sombrio',
  Urshifu: 'Lutador/Sombrio',
  Oinkologne: 'Normal',
  Maushold: 'Normal',
  Squawkabilly: 'Normal/Voador',
  Palafin: 'Água',
  Tatsugiri: 'Dragão/Água',
  Dudunsparce: 'Normal',
  Roaring_Steppe: 'Dragão/Sombrio',
  Great_Karina: 'Terra/Lutador',
  Tinkatunk: 'Fada/Aço',
}

async function main() {
  const speciesNames = new Set()

  for (const gen of genFiles) {
    const file = path.join(dataDir, `${gen}.json`)
    if (!fs.existsSync(file)) continue
    const list = JSON.parse(fs.readFileSync(file, 'utf8'))
    for (const name of list) {
      speciesNames.add(name)
    }
  }

  const fetchJson = async (url) => {
    const response = await fetch(url, { headers: { accept: 'application/json' } })
    if (!response.ok) {
      throw new Error(`Request failed ${response.status} for ${url}`)
    }
    return response.json()
  }

  const pokemonList = await fetchJson('https://pokeapi.co/api/v2/pokemon?limit=2000')
  const apiNameByComparable = new Map()
  if (Array.isArray(pokemonList?.results)) {
    pokemonList.results.forEach((entry) => {
      if (entry?.name) {
        apiNameByComparable.set(normalizeComparable(entry.name), entry.name)
      }
    })
  }

  const resolveApiName = (name) => apiNameByComparable.get(normalizeComparable(name)) || repoNameToSlug(name)
  const pokemonCache = new Map()

  const getPokemonData = async (name) => {
    const apiName = resolveApiName(name)
    const url = `https://pokeapi.co/api/v2/pokemon/${apiName}`
    if (!pokemonCache.has(url)) {
      pokemonCache.set(
        url,
        fetchJson(url)
          .then((data) => ({ ok: true, data }))
          .catch((error) => ({ ok: false, error })),
      )
    }
    return pokemonCache.get(url)
  }

  const wildTypes = {}
  const skipped = []

  const speciesArray = Array.from(speciesNames)
  const batchSize = 20

  for (let index = 0; index < speciesArray.length; index += batchSize) {
    const batch = speciesArray.slice(index, index + batchSize)
    const batchResults = await Promise.all(batch.map(async (species) => ({ species, result: await getPokemonData(species) })))

    batchResults.forEach(({ species, result }) => {
      if (!result?.ok) {
        skipped.push({ species, reason: result?.error?.message || 'request-failed' })
        return
      }

      const types = Array.isArray(result.data?.types)
        ? result.data.types
            .slice()
            .sort((left, right) => (left?.slot || 0) - (right?.slot || 0))
            .map((entry) => typeLabels[entry?.type?.name])
            .filter(Boolean)
        : []

      if (types.length === 0) {
        const manualType = manualWildTypeOverrides[species]
        if (manualType) {
          wildTypes[species] = manualType
          return
        }

        skipped.push({ species, reason: 'missing-types' })
        return
      }

      wildTypes[species] = types.join('/')
    })
  }

  for (const [species, manualType] of Object.entries(manualWildTypeOverrides)) {
    if (!wildTypes[species]) {
      wildTypes[species] = manualType
    }
  }

  fs.writeFileSync(outputFile, `${JSON.stringify(wildTypes, null, 2)}\n`)

  const summaryFile = path.join(repoRoot, '.tmp', 'wild-types-summary.json')
  fs.mkdirSync(path.dirname(summaryFile), { recursive: true })
  fs.writeFileSync(
    summaryFile,
    `${JSON.stringify(
      {
        totalSpecies: speciesNames.size,
        generatedTypes: Object.keys(wildTypes).length,
        skippedCount: skipped.length,
        skipped,
      },
      null,
      2,
    )}\n`,
  )

  console.log(`wrote ${path.relative(repoRoot, outputFile)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
