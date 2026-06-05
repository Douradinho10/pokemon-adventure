---
name: Bot simulation timing
description: Multiplayer bots had unrealistic wave timing — fixed to match real player pace.
---

# Bot simulation timing

**Rule:** Bot wave step delay must be measured in seconds (20-40s), not milliseconds (450-900ms). Initial start delay should also be realistic (10-20s).

**Why:** Original 450-900ms per wave meant a bot finished waves 10-15 in ~5 seconds total, always winning before the human player even started their run.

**How to apply:** In `server/socket-server.js` `scheduleBotSimulation`:
- `waveStepDelayMs = randomInt(20000, 40000)` 
- Initial delay: `randomInt(10000, 20000)`
