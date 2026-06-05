---
name: getSpeciesAtLevel fix
description: The function was broken — returned base form immediately due to wrong condition; now walks forward through evolution chain.
---

# getSpeciesAtLevel — forward evolution walk

**Rule:** Walk FORWARD through `evolutionRules` using the level to advance. Old code checked `minWildLevelBySpecies[speciesName] <= level` and returned immediately, so "Pidgey" at level 30 always returned "Pidgey" instead of "Pidgeotto".

**Why:** The condition `minWildLevel <= level` is always true for base forms (min=1). The function needs to ADVANCE to the correct stage, not just check if the base form is valid.

**How to apply:** Fixed in `data/pokemonData.ts`. The new loop:
```js
for (let i = 0; i < 10; i++) {
  const rule = evolutionRules[current]
  if (!rule?.level || !rule.evolvesTo) break
  if (level >= rule.level) { current = rule.evolvesTo } else { break }
}
return current
```
