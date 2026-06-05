---
name: Multiplayer casual join broken
description: Two bugs prevented casual multiplayer from working — a bad redirect and missing state code after join.
---

# Multiplayer casual join — two bugs

## Bug 1: window.location.href redirect in createMultiplayerRoom
`lib/socketMultiplayerService.ts` — `createMultiplayerRoom` was doing `window.location.href = /multiplayer?roomId=...` after a successful socket ACK. Since there is no `/multiplayer` route in the Next.js app (only `/` and `/login`), this caused a 404. Even if a route existed, the redirect fired before the caller's `setMultiplayerJoinedRoomId(...)` state updates could run.

**Fix:** Remove the `window.location.href` line entirely. The caller (`handleCreateMultiplayerRoom` in the component) already sets all necessary state.

## Bug 2: joinMultiplayerRoomByCode had a placeholder comment
`components/PokemonAdventureClient.tsx` — `joinMultiplayerRoomByCode` had a literal comment `// ... (resto do código da função)` where the state-setting code should be. After a successful `joinMultiplayerRoom()` call, nothing was set — no `setMultiplayerJoinedRoomId`, no `setMultiplayerRoom`, no `setMultiplayerIsCasual`, no `setMultiplayerBusy(false)`. So the client never knew it joined a room.

**Fix:** Replace the placeholder with the actual state-setting code:
```typescript
clearPendingInviteJoin()
setMultiplayerJoinedRoomId(room.id)
setMultiplayerRoom(room)
setMultiplayerRoomCodeInput(room.id)
setMultiplayerMode(false)
setMultiplayerIsCasual(room.mode === "casual")
setCasualLobbyVisibility(room.visibility ?? "private")
setMultiplayerBusy(false)
return true
```

**Why:** These were left as stubs/comments — likely a partially applied AI edit that got cut off.

**How to apply:** Always check for literal placeholder comments like `// ... (resto do código)` or `/* ... outras dependências ... */` in the codebase — they indicate incomplete code.
