const fs = require('fs');
const path = require('path');
const srcPath = path.join(__dirname, '..', 'data', 'pokemonData.ts');
const outDir = path.join(__dirname, '..', '.tmp');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
const outPath = path.join(outDir, 'dataset-scan-report.json');
const content = fs.readFileSync(srcPath, 'utf8');

function extractObjectKeys(objText) {
  const keys = new Set();
  const keyRegex = /["']?([\w\-\s\'\.Ã\u0080-\uFFFF%]+?)["']?\s*:/g;
  let m;
  while ((m = keyRegex.exec(objText))) {
    const k = m[1].trim();
    if (k && !/^(sprite|type|baseHP|rarity|speed|attacks|level|xp|maxHP|HP)$/.test(k)) keys.add(k);
  }
  return Array.from(keys);
}

function extractAttacks(content) {
  const attacks = new Set();
  const attacksRegex = /attacks\s*:\s*\{([\s\S]*?)\}\s*,?/gi;
  let m;
  while ((m = attacksRegex.exec(content))) {
    const block = m[1];
    const keyRegex = /["']?([^"'\n:]+?)["']?\s*:\s*\[\s*\d+\s*,/g;
    let k;
    while ((k = keyRegex.exec(block))) {
      attacks.add(k[1].trim());
    }
  }
  return Array.from(attacks);
}

function extractLevelUpMoveNames(content) {
  const moves = new Set();
  const nameRegex = /name\s*:\s*["']([^"']+)["']/g;
  let m;
  while ((m = nameRegex.exec(content))) moves.add(m[1].trim());
  return Array.from(moves);
}

function extractMapKeys(name) {
  const regex = new RegExp(name + '\\s*=\\s*\\{([\\s\\S]*?)\\}');
  const m = regex.exec(content);
  if (!m) return [];
  return extractObjectKeys(m[1]).map(k => k.trim());
}

const attacks = extractAttacks(content);
const levelUpMoves = extractLevelUpMoveNames(content);
const attackTypeKeys = Object.keys(require('vm').runInNewContext('(' + content.match(/const attackTypeLookup[\s\S]*?=\s*\{([\s\S]*?\n)\};/)?.[0] + ')') || {});

// Fallback safe regex extractions
const attackTypeKeysSafe = (function(){
  const m = content.match(/const attackTypeLookup[\s\S]*?=\s*\{([\s\S]*?)\}/);
  if (!m) return [];
  return extractObjectKeys(m[1]);
})();

const moveBattleKeys = (function(){
  const m = content.match(/const moveBattleEffects[\s\S]*?=\s*\{([\s\S]*?)\}/);
  if (!m) return [];
  return extractObjectKeys(m[1]);
})();

const moveStatusKeys = (function(){
  const m = content.match(/const moveStatusEffects[\s\S]*?=\s*\{([\s\S]*?)\}/);
  if (!m) return [];
  return extractObjectKeys(m[1]);
})();

const movePPKeys = (function(){
  const m = content.match(/export const MOVE_PP[\s\S]*?=\s*\{([\s\S]*?)\}/);
  if (!m) return [];
  return extractObjectKeys(m[1]);
})();

function normalize(name){
  return name.replace(/['\"]/g,'').trim().toLowerCase();
}

const attacksSet = new Set(attacks.map(normalize));
const levelMovesSet = new Set(levelUpMoves.map(normalize));
const attackTypeSet = new Set(attackTypeKeysSafe.map(normalize));
const moveBattleSet = new Set(moveBattleKeys.map(normalize));
const moveStatusSet = new Set(moveStatusKeys.map(normalize));
const movePPSet = new Set(movePPKeys.map(normalize));

const attacksNotInLookup = Array.from(attacksSet).filter(m => !attackTypeSet.has(m));
const levelMovesNotInLookup = Array.from(levelMovesSet).filter(m => !attackTypeSet.has(m));
const attacksNotInPP = Array.from(attacksSet).filter(m => !movePPSet.has(m));
const levelMovesNotInPP = Array.from(levelMovesSet).filter(m => !movePPSet.has(m));
const movesMissingBattleEffect = Array.from(new Set([...attacksSet, ...levelMovesSet])).filter(m => !moveBattleSet.has(m) && !moveStatusSet.has(m));

const report = {
  totalAttacksFound: attacks.length,
  totalLevelUpMovesFound: levelUpMoves.length,
  attackTypeLookupCount: attackTypeKeysSafe.length,
  moveBattleEffectsCount: moveBattleKeys.length,
  moveStatusEffectsCount: moveStatusKeys.length,
  movePPCount: movePPKeys.length,
  attacksNotInLookup: attacksNotInLookup.sort(),
  levelMovesNotInLookup: levelMovesNotInLookup.sort(),
  attacksNotInPP: attacksNotInPP.sort(),
  levelMovesNotInPP: levelMovesNotInPP.sort(),
  movesMissingAnyEffectOrBattleEntry: movesMissingBattleEffect.sort(),
};

fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log('Report written to', outPath);
console.log(JSON.stringify(report, null, 2));
process.exit(0);
