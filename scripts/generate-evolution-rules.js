const fs = require('fs')
const path = require('path')

const repoRoot = path.join(__dirname, '..')
const dataDir = path.join(repoRoot, 'data', 'pokedex')
const outputFile = path.join(dataDir, 'evolution-rules.generated.json')

const genFiles = ['gen1', 'gen2', 'gen3', 'gen4', 'gen5', 'gen6', 'gen7', 'gen8', 'gen9']

const normalizeComparable = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
const repoNameToSlug = (name) =>
  name
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9-]/g, '')

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

  const repoNameByComparable = new Map()
  for (const name of speciesNames) {
    repoNameByComparable.set(normalizeComparable(name), name)
  }

  const fetchJson = async (url) => {
    const response = await fetch(url, { headers: { accept: 'application/json' } })
    if (!response.ok) {
      throw new Error(`Request failed ${response.status} for ${url}`)
    }
    return response.json()
  }

  const chainCache = new Map()

  const chainList = await fetchJson('https://pokeapi.co/api/v2/evolution-chain?limit=1000')
  const chainUrls = Array.isArray(chainList?.results) ? chainList.results.map((entry) => entry.url).filter(Boolean) : []

  const getChainData = async (url) => {
    if (!chainCache.has(url)) {
      chainCache.set(url, fetchJson(url))
    }
    return chainCache.get(url)
  }

  const evolutionRules = {}
  const skipped = []

  const processChainData = (chainData, chainUrl) => {
    if (!chainData?.chain) {
      skipped.push({ name: chainUrl, reason: 'missing-chain-root' })
      return
    }

    const edges = []
    const walk = (node) => {
      const fromName = node?.species?.name
      const fromRepoName = repoNameByComparable.get(normalizeComparable(fromName || ''))
      const children = Array.isArray(node?.evolves_to) ? node.evolves_to : []

      for (const evolved of children) {
        const toName = evolved?.species?.name
        const toRepoName = repoNameByComparable.get(normalizeComparable(toName || ''))
        const levelUpDetails = (evolved?.evolution_details || []).filter(
          (detail) => detail?.trigger?.name === 'level-up' && typeof detail?.min_level === 'number',
        )

        if (fromRepoName && toRepoName && levelUpDetails.length === 1 && children.length === 1) {
          edges.push({ from: fromRepoName, to: toRepoName, level: levelUpDetails[0].min_level })
        }

        walk(evolved)
      }
    }

    walk(chainData.chain)

    for (const edge of edges) {
      const existing = evolutionRules[edge.from]
      if (!existing || edge.level < existing.level) {
        evolutionRules[edge.from] = { level: edge.level, evolvesTo: edge.to }
      }
    }
  }

  const batchSize = 20
  for (let index = 0; index < chainUrls.length; index += batchSize) {
    const batch = chainUrls.slice(index, index + batchSize)
    const batchResults = await Promise.all(
      batch.map(async (chainUrl) => {
        try {
          return { chainUrl, chainData: await getChainData(chainUrl) }
        } catch (error) {
          return { chainUrl, error }
        }
      }),
    )

    batchResults.forEach(({ chainUrl, chainData, error }) => {
      if (error) {
        skipped.push({ name: chainUrl, reason: 'chain-request-failed' })
        return
      }

      processChainData(chainData, chainUrl)
    })
  }

  fs.writeFileSync(outputFile, `${JSON.stringify(evolutionRules, null, 2)}\n`)

  const summaryFile = path.join(repoRoot, '.tmp', 'evolution-rules-summary.json')
  fs.mkdirSync(path.dirname(summaryFile), { recursive: true })
  fs.writeFileSync(
    summaryFile,
    `${JSON.stringify(
      {
        totalSpecies: speciesNames.size,
        generatedRules: Object.keys(evolutionRules).length,
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