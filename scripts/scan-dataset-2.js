const fs = require('fs');
const path = require('path');
const srcPath = path.join(__dirname, '..', 'data', 'pokemonData.ts');
const outDir = path.join(__dirname, '..', '.tmp');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
const outPath = path.join(outDir, 'dataset-scan-report-2.json');
const content = fs.readFileSync(srcPath, 'utf8');

function extractKeysFromObjectLiteral(objText) {
  const keys = new Set();
  const keyRegex = /["']?([^"'\n:]+?)["']?\s*:/g;
  let m;
  while ((m = keyRegex.exec(objText))) {
    const key = m[1].trim();
    if (key.length > 0) keys.add(key);
  }
  return Array.from(keys);
}

function extractAttacks(content) {
  const attacks = new Set();
  const regex = /attacks\s*:\s*\{([\s\S]*?)\}\s*(?:,|\n)/gi;
  let m;
  while ((m = regex.exec(content))) {
    const block = m[1];
    const keyRegex = /["']?([^"'\n:]+?)["']?\s*:\s*\[/g;
    let k;
    while ((k = keyRegex.exec(block))) {
      attacks.add(k[1].trim());
    }
  }
  return Array.from(attacks);
}

function extractLevelUpMoves(content) {
  const moves = new Set();
  const regex = /name\s*:\s*["']([^"']+)["']/gi;
  let m;
  while ((m = regex.exec(content))) moves.add(m[1].trim());
  return Array.from(moves);
}

function extractMap(name) {
  const regex = new RegExp(name + "\\s*=\\s*\\{([\\s\\S]*?)\\}\\s*;", 'i');
  const m = content.match(regex);
  if (!m) return [];
  return extractKeysFromObjectLiteral(m[1]);
}

const attacks = extractAttacks(content);
const levelMoves = extractLevelUpMoves(content);
const attackTypeKeys = extractMap('const attackTypeLookup');
const moveStatusKeys = extractMap('const moveStatusEffects');
const moveBattleKeys = extractMap('const moveBattleEffects');
const movePPKeys = extractMap('export const MOVE_PP');

function normalize(n){ return n.toLowerCase().replace(/_/g,' ').trim(); }

const attacksSet = new Set(attacks.map(normalize));
const levelMovesSet = new Set(levelMoves.map(normalize));
const attackTypeSet = new Set(attackTypeKeys.map(normalize));
const moveStatusSet = new Set(moveStatusKeys.map(normalize));
const moveBattleSet = new Set(moveBattleKeys.map(normalize));
const movePPSet = new Set(movePPKeys.map(normalize));

const attacksNotInLookup = Array.from(attacksSet).filter(m => !attackTypeSet.has(m)).sort();
const levelMovesNotInLookup = Array.from(levelMovesSet).filter(m => !attackTypeSet.has(m)).sort();
const attacksNotInPP = Array.from(attacksSet).filter(m => !movePPSet.has(m)).sort();
const levelMovesNotInPP = Array.from(levelMovesSet).filter(m => !movePPSet.has(m)).sort();
const movesMissingAnyEffectOrBattleEntry = Array.from(new Set([...attacksSet, ...levelMovesSet])).filter(m => !moveBattleSet.has(m) && !moveStatusSet.has(m)).sort();

const report = {
  counts: {
    attacksFound: attacks.length,
    levelMovesFound: levelMoves.length,
    attackTypeLookup: attackTypeKeys.length,
    moveStatus: moveStatusKeys.length,
    moveBattle: moveBattleKeys.length,
    movePP: movePPKeys.length
  },
  attacksNotInLookup,
  levelMovesNotInLookup,
  attacksNotInPP,
  levelMovesNotInPP,
  movesMissingAnyEffectOrBattleEntry
};

fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log('Wrote', outPath);
console.log(JSON.stringify(report, null, 2));
