const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'data', 'pokemonData.ts');
const generatedTypesPath = path.join(__dirname, '..', 'data', 'pokedex', 'wild-types.generated.json');

const src = fs.readFileSync(dataPath, 'utf8');
const genTypes = JSON.parse(fs.readFileSync(generatedTypesPath, 'utf8'));

const results = [];

// Find the wildPokemon object literal start
const startMarker = 'export const wildPokemon';
const startIndex = src.indexOf(startMarker);
if (startIndex === -1) {
  console.error('wildPokemon export not found')
  process.exit(1)
}

const braceIndex = src.indexOf('{', startIndex);
if (braceIndex === -1) {
  console.error('wildPokemon object start brace not found')
  process.exit(1)
}

// crude scanner to extract top-level entries until the matching closing brace
let i = braceIndex + 1
let depth = 1
let endIndex = -1
for (; i < src.length; i++) {
  const ch = src[i]
  if (ch === '{') depth++
  else if (ch === '}') depth--
  if (depth === 0) { endIndex = i; break }
}
if (endIndex === -1) {
  console.error('wildPokemon object end not found')
  process.exit(1)
}

const objectText = src.slice(braceIndex + 1, endIndex) // inner contents

// split by top-level entries like '  Name: { ... },' by scanning
let pos = 0
while (pos < objectText.length) {
  // skip whitespace
  while (pos < objectText.length && /\s/.test(objectText[pos])) pos++
  // read name until ':'
  const nameStart = pos
  while (pos < objectText.length && /[A-Za-z0-9_]/.test(objectText[pos])) pos++
  if (pos === nameStart) break
  const name = objectText.slice(nameStart, pos)
  // skip to opening brace
  while (pos < objectText.length && objectText[pos] !== '{') pos++
  if (pos >= objectText.length) break
  let localDepth = 0
  const blockStart = pos
  while (pos < objectText.length) {
    if (objectText[pos] === '{') localDepth++
    else if (objectText[pos] === '}') {
      localDepth--
      if (localDepth === 0) { pos++; break }
    }
    pos++
  }
  const block = objectText.slice(blockStart, pos)
  // attempt to extract type and rarity from block
  const typeMatch = block.match(/type:\s*"([^"']+)"/)
  const rarityMatch = block.match(/rarity:\s*"([^"']+)"/) || block.match(/rarity:\s*'([^']+)'/)
  const type = typeMatch ? typeMatch[1] : null
  const rarity = rarityMatch ? rarityMatch[1] : null

  const canonicalType = genTypes[name]
  if (canonicalType && type !== canonicalType) {
    results.push({ name, field: 'type', fileType: type, canonicalType })
  }
  if (rarity && !['comum','raro','lendario'].includes(rarity)) {
    results.push({ name, field: 'rarity', fileRarity: rarity, normalized: 'comum' })
  }

  // continue
}

if (results.length === 0) {
  console.log('No mismatches found')
  process.exit(0)
}

console.log('Mismatches found:')
results.forEach(r => console.log(JSON.stringify(r)))
process.exit(0)
