const { createServer } = require("http")
const { Server } = require("socket.io")

const PORT = Number(process.env.PORT || process.env.SOCKET_SERVER_PORT || 4001)
const ORIGIN = process.env.SOCKET_SERVER_ORIGIN || "*"
const ORIGIN_REGEX = process.env.SOCKET_SERVER_ORIGIN_REGEX || "^https://pokemon-adventure-.*\\.vercel\\.app$"

const ROOM_STALE_MS = 30 * 60 * 1000
const FINISHED_ROOM_TTL_MS = 10 * 60 * 1000
const ROOM_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const ROOM_ID_LENGTH = 5

const rooms = new Map()

const allowedOrigins = ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)

let originRegex = null
if (ORIGIN_REGEX) {
  try {
    originRegex = new RegExp(ORIGIN_REGEX)
  } catch {
    originRegex = null
  }
}

function isOriginAllowed(origin) {
  if (!origin) {
    return true
  }

  if (allowedOrigins.includes("*")) {
    return true
  }

  if (allowedOrigins.includes(origin)) {
    return true
  }

  return Boolean(originRegex && originRegex.test(origin))
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = ""

    req.on("data", (chunk) => {
      body += chunk

      if (body.length > 10_000) {
        reject(new Error("Request body too large"))
        req.destroy()
      }
    })

    req.on("end", () => resolve(body))
    req.on("error", reject)
  })
}

const httpServer = createServer((req, res) => {
  const requestUrl = req.url || "/"

  if (requestUrl.startsWith("/socket.io/")) {
    return
  }

  if (requestUrl === "/multiplayer/leave" && req.method === "POST") {
    readRequestBody(req)
      .then((body) => {
        let payload = null

        if (body) {
          try {
            payload = JSON.parse(body)
          } catch {
            payload = null
          }
        }

        const roomId = String(payload?.roomId || "").trim()
        const userId = String(payload?.userId || "").trim()

        if (roomId && userId) {
          removeUserFromRoom(roomId, userId)
        }

        res.statusCode = 204
        res.end()
      })
      .catch(() => {
        res.statusCode = 204
        res.end()
      })

    return
  }

  if (requestUrl === "/" || requestUrl.startsWith("/healthz")) {
    res.statusCode = 200
    res.setHeader("Content-Type", "application/json")
    res.end(JSON.stringify({ ok: true, service: "pokemon-adventure-socket" }))
    return
  }

  res.statusCode = 404
  res.setHeader("Content-Type", "application/json")
  res.end(JSON.stringify({ ok: false, message: "Not Found" }))
})

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true)
        return
      }

      callback(new Error(`Origin not allowed: ${origin}`), false)
    },
    methods: ["GET", "POST"],
  },
})
// Helper to robustly require the data module from different relative paths
function tryLoadPokemonData() {
  const candidates = ["../data/pokemonData", "../../data/pokemonData", "../data/pokemonData.js", "../../data/pokemonData.js", "../data/pokemonData.ts", "../../data/pokemonData.ts"]
  for (const p of candidates) {
    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const mod = require(p)
      if (mod) return mod
    } catch (err) {
      // ignore and try next
    }
  }
  console.error("pokemon-adventure: failed to load data/pokemonData from known paths")
  return null
}
function cloneRoom(room) {
  return {
    ...room,
    players: Object.fromEntries(
      Object.entries(room.players || {}).map(([id, player]) => [
        id,
        {
          ...player,
        },
      ]),
    ),
  }
}

function isBotId(userId) {
  return typeof userId === "string" && userId.startsWith("BOT_")
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function scheduleBotSimulation(roomId, botId) {
  const entry = getRoomEntry(roomId)
  if (!entry) return
  const room = entry.room
  if (!room || !room.players || !room.players[botId]) return

  // choose starter (if roulette) and broadcast quickly
  const starterMode = room.starterMode || (room.mode === "competitive" ? "roulette" : "manual")
  if (starterMode === "roulette") {
    const starterNames = Object.keys((tryLoadPokemonData()?.starterPokemon) || {})
    const choice = starterNames.length ? starterNames[randomInt(0, starterNames.length - 1)] : null
    if (choice) {
      const nextRoom = {
        ...room,
        players: {
          ...room.players,
          [botId]: {
            ...(room.players[botId] || {}),
            // expose chosen starter for clients if they care
            starterName: choice,
          },
        },
      }

      saveRoom(nextRoom)
      broadcastRoom(roomId)
    }
  }

  const targetWave = randomInt(10, 15)
  // Each wave takes 20-40 seconds to simulate, matching real player pace
  const waveStepDelayMs = randomInt(20000, 40000)

  const advanceWave = (wave) => {
    const entry2 = getRoomEntry(roomId)
    if (!entry2) return
    const room2 = entry2.room
    if (!room2 || !room2.players || !room2.players[botId]) return

    const currentPlayer = room2.players[botId]
    const now = Date.now()
    const isFinalWave = wave >= targetWave

    const nextRoom2 = {
      ...room2,
      players: {
        ...room2.players,
        [botId]: {
          ...(currentPlayer || {}),
          bestWave: Math.max(currentPlayer.bestWave || 0, wave),
          finishedAt: isFinalWave ? currentPlayer.finishedAt || now : currentPlayer.finishedAt,
          ready: false,
        },
      },
    }

    if (isFinalWave) {
      const everyoneFinished = areAllPlayersResolved(nextRoom2.players)
      if (everyoneFinished) {
        saveRoom(finalizeFinishedRoom(nextRoom2, now))
        broadcastRoom(roomId)
        return
      }

      saveRoom(nextRoom2)
      broadcastRoom(roomId)
      return
    }

    saveRoom(nextRoom2)
    broadcastRoom(roomId)

    setTimeout(() => advanceWave(wave + 1), waveStepDelayMs)
  }

  // Wait 10-20s before starting so the human player has time to begin their run
  setTimeout(() => advanceWave(1), randomInt(10000, 20000))
}

function generateRoomId(length = ROOM_ID_LENGTH) {
  let output = ""
  for (let index = 0; index < length; index++) {
    const randomIndex = Math.floor(Math.random() * ROOM_ID_ALPHABET.length)
    output += ROOM_ID_ALPHABET[randomIndex]
  }

  return output
}

function roomPlayerCount(room) {
  return Object.keys(room.players || {}).length
}

function hasPlayerResolved(player) {
  return typeof player?.finishedAt === "number" || typeof player?.forfeitAt === "number"
}

function areAllPlayersResolved(players) {
  return Object.values(players || {}).every((player) => hasPlayerResolved(player))
}

function areAllPlayersReady(room) {
  const players = Object.values(room.players || {})
  return players.length >= 2 && players.every((player) => player.ready !== false)
}

function determineRoomWinner(room) {
  const players = Object.values(room.players || {})
  if (players.length === 0) {
    return null
  }

  const sortedPlayers = [...players].sort((left, right) => {
    const leftForfeit = typeof left.forfeitAt === "number"
    const rightForfeit = typeof right.forfeitAt === "number"

    if (leftForfeit !== rightForfeit) {
      return leftForfeit ? 1 : -1
    }

    const waveDelta = Math.max(0, right.bestWave || 0) - Math.max(0, left.bestWave || 0)
    if (waveDelta !== 0) {
      return waveDelta
    }

    const leftResolvedAt = left.finishedAt || left.forfeitAt || 0
    const rightResolvedAt = right.finishedAt || right.forfeitAt || 0
    if (leftResolvedAt !== rightResolvedAt) {
      return leftResolvedAt - rightResolvedAt
    }

    return left.joinedAt - right.joinedAt
  })

  const winner = sortedPlayers[0]
  if (!winner) {
    return null
  }

  const anyForfeit = players.some((player) => typeof player.forfeitAt === "number")
  const tiedOnWave = sortedPlayers.length > 1 && Math.max(0, sortedPlayers[0].bestWave || 0) === Math.max(0, sortedPlayers[1].bestWave || 0)

  return {
    winnerUserId: winner.userId,
    winnerDisplayName: winner.displayName,
    winnerReason: anyForfeit ? "forfeit" : tiedOnWave ? "tie" : "wave",
  }
}

function finalizeFinishedRoom(room, finishedAt = Date.now()) {
  const winner = determineRoomWinner(room)

  return {
    ...room,
    status: "finished",
    finishedAt,
    winnerUserId: winner?.winnerUserId,
    winnerDisplayName: winner?.winnerDisplayName,
    winnerReason: winner?.winnerReason,
  }
}

function resetRoomForRematch(room) {
  return {
    ...room,
    status: "waiting",
    startedAt: undefined,
    finishedAt: undefined,
    winnerUserId: undefined,
    winnerDisplayName: undefined,
    winnerReason: undefined,
    players: Object.fromEntries(
      Object.entries(room.players || {}).map(([id, player]) => [
        id,
        {
          ...player,
          bestWave: 0,
          finishedAt: undefined,
          forfeitAt: undefined,
          ready: false,
        },
      ]),
    ),
  }
}

function normalizeRoomHost(room, players) {
  const hostCandidate = players[room.hostUserId] && !hasPlayerResolved(players[room.hostUserId]) ? room.hostUserId : null
  if (hostCandidate) {
    return {
      hostUserId: hostCandidate,
      hostDisplayName: players[hostCandidate]?.displayName || room.hostDisplayName,
    }
  }

  const nextHost = Object.values(players).find((player) => !hasPlayerResolved(player)) || Object.values(players)[0]
  if (!nextHost) {
    return {
      hostUserId: room.hostUserId,
      hostDisplayName: room.hostDisplayName,
    }
  }

  return {
    hostUserId: nextHost.userId,
    hostDisplayName: nextHost.displayName,
  }
}

function finalizePlayerDeparture(room, userId, { forfeit = false } = {}) {
  const player = room.players?.[userId]
  if (!player) {
    return cloneRoom(room)
  }

  if (room.status === "waiting" && !forfeit) {
    const nextPlayers = { ...room.players }
    delete nextPlayers[userId]

    if (Object.keys(nextPlayers).length === 0) {
      return null
    }

    const host = normalizeRoomHost(room, nextPlayers)
    return {
      ...room,
      hostUserId: host.hostUserId,
      hostDisplayName: host.hostDisplayName,
      players: nextPlayers,
      status: room.status,
    }
  }

  if (hasPlayerResolved(player)) {
    return cloneRoom(room)
  }

  const now = Date.now()
  const nextPlayers = {
    ...room.players,
    [userId]: {
      ...player,
      finishedAt: player.finishedAt || now,
      forfeitAt: forfeit ? player.forfeitAt || now : player.forfeitAt,
      ready: false,
    },
  }

  const nextRoom = {
    ...room,
    starterMode: room.starterMode || (room.mode === "competitive" ? "roulette" : "manual"),
    players: nextPlayers,
    ...normalizeRoomHost(room, nextPlayers),
  }

  return finalizeFinishedRoom(nextRoom, now)
}

function saveRoom(room) {
  rooms.set(room.id, {
    room: cloneRoom(room),
    updatedAt: Date.now(),
  })
  return cloneRoom(room)
}

function getRoomEntry(roomId) {
  return rooms.get(roomId) || null
}

function getRoom(roomId) {
  const entry = getRoomEntry(roomId)
  return entry ? cloneRoom(entry.room) : null
}

function isFreshRoom(room, updatedAt) {
  const now = Date.now()
  if (room.status === "finished") {
    return now - Math.max(room.finishedAt || 0, updatedAt) <= FINISHED_ROOM_TTL_MS
  }

  return now - updatedAt <= ROOM_STALE_MS
}

function broadcastRoom(roomId) {
  const room = getRoom(roomId)
  if (!room) {
    return
  }

  io.to(roomId).emit("multiplayer:room:update", {
    roomId,
    room,
  })
}

function deleteRoom(roomId) {
  const room = getRoom(roomId)
  if (!room) {
    rooms.delete(roomId)
    return
  }

  rooms.delete(roomId)
  io.to(roomId).emit("multiplayer:room:deleted", {
    roomId,
  })
}

function removeUserFromRoom(roomId, userId) {
  const entry = getRoomEntry(roomId)
  if (!entry) {
    return null
  }

  const room = entry.room
  const nextRoom = finalizePlayerDeparture(room, userId, { forfeit: room.status === "active" })

  if (!nextRoom) {
    deleteRoom(roomId)
    return null
  }

  saveRoom(nextRoom)
  broadcastRoom(roomId)
  return cloneRoom(nextRoom)
}

function removeUserFromOtherRooms(userId, exceptRoomId = null) {
  for (const [roomId, entry] of rooms.entries()) {
    if (exceptRoomId && roomId === exceptRoomId) {
      continue
    }

    if (!entry?.room?.players?.[userId]) {
      continue
    }

    removeUserFromRoom(roomId, userId)
  }
}

function addPlayerToRoom(roomId, userId, displayName) {
  const entry = getRoomEntry(roomId)
  if (!entry) {
    return { ok: false, message: "Sala nao encontrada" }
  }

  const room = entry.room
  const players = room.players || {}

  if (players[userId]) {
    const existingRoom = cloneRoom(room)
    saveRoom(existingRoom)
    broadcastRoom(roomId)
    return { ok: true, room: existingRoom }
  }

  if (room.status !== "waiting") {
    return { ok: false, message: "A sala ja foi iniciada" }
  }

  if (roomPlayerCount(room) >= room.maxPlayers) {
    return { ok: false, message: "Sala cheia" }
  }

  removeUserFromOtherRooms(userId, roomId)

  const nextPlayers = {
    ...players,
    [userId]: {
      userId,
      displayName,
      joinedAt: Date.now(),
      bestWave: 0,
      ready: false,
    },
  }

  const shouldAutoStart = false
  const nextRoom = {
    ...room,
    starterMode: room.starterMode || (room.mode === "competitive" ? "roulette" : "manual"),
    status: shouldAutoStart ? "active" : room.status,
    startedAt: shouldAutoStart ? Date.now() : room.startedAt,
    players: shouldAutoStart
      ? Object.fromEntries(
          Object.entries(nextPlayers).map(([id, player]) => [
            id,
            {
              ...player,
              bestWave: 0,
              finishedAt: undefined,
              forfeitAt: undefined,
              ready: true,
            },
          ]),
        )
      : nextPlayers,
  }

  saveRoom(nextRoom)
  broadcastRoom(roomId)
  return { ok: true, room: cloneRoom(nextRoom) }
}

function createRoom(params) {
  removeUserFromOtherRooms(params.hostUserId)

  for (let attempt = 0; attempt < 30; attempt++) {
    const roomId = generateRoomId()
    if (rooms.has(roomId)) {
      continue
    }

    const now = Date.now()
    const room = {
      id: roomId,
      hostUserId: params.hostUserId,
      hostDisplayName: params.hostDisplayName,
      mode: params.mode,
      visibility: params.visibility || "private",
      maxPlayers: params.maxPlayers,
      status: "waiting",
      createdAt: now,
      starterMode: params.mode === "competitive" ? "roulette" : "manual",
      players: {
        [params.hostUserId]: {
          userId: params.hostUserId,
          displayName: params.hostDisplayName,
          joinedAt: now,
          bestWave: 0,
          ready: false,
        },
      },
    }

    saveRoom(room)
    return cloneRoom(room)
  }

  throw new Error("Falha ao gerar codigo da sala")
}

function listPublicCasualLobbies(limitCount) {
  return [...rooms.values()]
    .map(({ room, updatedAt }) => ({ room: cloneRoom(room), updatedAt }))
    .filter(({ room, updatedAt }) => {
      const isFresh = isFreshRoom(room, updatedAt)
      return room.mode === "casual" && room.visibility === "public" && room.status === "waiting" && roomPlayerCount(room) < room.maxPlayers && isFresh
    })
    .sort((a, b) => {
      const countA = roomPlayerCount(a.room)
      const countB = roomPlayerCount(b.room)

      if (countB !== countA) {
        return countB - countA
      }

      return b.room.createdAt - a.room.createdAt
    })
    .slice(0, limitCount)
    .map(({ room }) => ({
      id: room.id,
      hostDisplayName: room.hostDisplayName,
      maxPlayers: room.maxPlayers,
      playersCount: roomPlayerCount(room),
      createdAt: room.createdAt,
    }))
}

function joinCompetitiveRoom(params) {
  for (const { room, updatedAt } of [...rooms.values()].map((entry) => ({ room: cloneRoom(entry.room), updatedAt: entry.updatedAt }))) {
    if (
      room.mode === "competitive" &&
      room.maxPlayers === params.maxPlayers &&
      room.status === "waiting" &&
      roomPlayerCount(room) < room.maxPlayers &&
      isFreshRoom(room, updatedAt)
    ) {
      if (room.players?.[params.userId]) {
        return { ok: true, room }
      }

      return addPlayerToRoom(room.id, params.userId, params.displayName)
    }
  }

  const room = createRoom({
    hostUserId: params.userId,
    hostDisplayName: params.displayName,
    maxPlayers: params.maxPlayers,
    mode: "competitive",
    visibility: "private",
  })

  return { ok: true, room }
}

function cleanupStaleRooms() {
  const now = Date.now()

  for (const [roomId, entry] of rooms.entries()) {
    const room = entry.room
    const age = now - entry.updatedAt
    const finishedAge = now - Math.max(room.finishedAt || 0, entry.updatedAt)

    if (room.status === "finished" && finishedAge > FINISHED_ROOM_TTL_MS) {
      deleteRoom(roomId)
      continue
    }

    if (age > ROOM_STALE_MS) {
      deleteRoom(roomId)
    }
  }
}

function withAck(handler) {
  return (...args) => {
    const maybeAck = args[args.length - 1]
    const ack = typeof maybeAck === "function" ? maybeAck : null

    try {
      const result = handler(...args.slice(0, ack ? -1 : args.length))
      if (result && typeof result.then === "function") {
        result
          .then((response) => {
            if (ack) {
              ack(response)
            }
          })
          .catch((error) => {
            if (ack) {
              ack({ ok: false, message: error instanceof Error ? error.message : "Erro no socket server" })
            }
          })
        return
      }

      if (ack) {
        ack(result)
      }
    } catch (error) {
      if (ack) {
        ack({ ok: false, message: error instanceof Error ? error.message : "Erro no socket server" })
      }
    }
  }
}

io.on("connection", (socket) => {
  socket.data.userId = null
  socket.data.joinedRoomIds = new Set()

  socket.on(
    "multiplayer:room:create",
    withAck((payload) => {
      const hostUserId = String(payload?.hostUserId || "").trim()
      const hostDisplayName = String(payload?.hostDisplayName || "Treinador").trim() || "Treinador"
      const maxPlayers = payload?.maxPlayers === 3 ? 3 : 2
      const mode = payload?.mode === "competitive" ? "competitive" : "casual"
      const visibility = payload?.visibility === "public" ? "public" : "private"

      if (!hostUserId) {
        return { ok: false, message: "userId invalido" }
      }

      const room = createRoom({
        hostUserId,
        hostDisplayName,
        maxPlayers,
        mode,
        visibility,
      })

      socket.data.userId = hostUserId
      socket.data.joinedRoomIds.add(room.id)
      socket.join(room.id)

      broadcastRoom(room.id)

      return { ok: true, room }
    }),
  )

  socket.on(
    "multiplayer:room:join",
    withAck((payload) => {
      const roomId = String(payload?.roomId || "").trim()
      const userId = String(payload?.userId || "").trim()
      const displayName = String(payload?.displayName || "Treinador").trim() || "Treinador"

      if (!roomId || !userId) {
        return { ok: false, message: "Dados invalidos para entrar na sala" }
      }

      const result = addPlayerToRoom(roomId, userId, displayName)
      if (result.ok && result.room) {
        socket.data.userId = userId
        socket.data.joinedRoomIds.add(roomId)
        socket.join(roomId)
      }

      return result
    }),
  )

  socket.on(
    "multiplayer:room:leave",
    withAck((payload) => {
      const roomId = String(payload?.roomId || "").trim()
      const userId = String(payload?.userId || "").trim()

      if (!roomId || !userId) {
        return { ok: false, message: "Dados invalidos para sair da sala" }
      }

      socket.leave(roomId)
      socket.data.joinedRoomIds.delete(roomId)
      removeUserFromRoom(roomId, userId)

      return { ok: true }
    }),
  )

  socket.on(
    "multiplayer:room:start",
    withAck((payload) => {
      const roomId = String(payload?.roomId || "").trim()
      const hostUserId = String(payload?.hostUserId || "").trim()
      const entry = getRoomEntry(roomId)

      if (!roomId || !hostUserId) {
        return { ok: false, message: "Dados invalidos para iniciar a sala" }
      }

      if (!entry) {
        return { ok: false, message: "Sala nao encontrada" }
      }

      const room = entry.room
      const playersCount = roomPlayerCount(room)
      const requiresReadyCheck = room.mode !== "competitive"

      if (room.status !== "waiting") {
        return { ok: false, message: "Sala ja iniciada" }
      }

      if (room.mode === "casual" && room.hostUserId !== hostUserId) {
        return { ok: false, message: "Apenas o host pode iniciar" }
      }

      // In casual mode, auto-ready the host when they call start so bots + host can begin
      const roomForReadyCheck =
        room.mode === "casual" && hostUserId && room.players?.[hostUserId]
          ? {
              ...room,
              players: {
                ...room.players,
                [hostUserId]: { ...room.players[hostUserId], ready: true },
              },
            }
          : room

      const minimumPlayers = room.mode === "competitive" ? room.maxPlayers : 2
      if (playersCount < minimumPlayers || (requiresReadyCheck && !areAllPlayersReady(roomForReadyCheck))) {
        return {
          ok: false,
          message:
            room.mode === "competitive"
              ? `Precisas de ${room.maxPlayers} jogadores para iniciar`
              : "Todos os jogadores precisam de estar prontos",
        }
      }

      const nextRoom = {
        ...room,
        status: "active",
        startedAt: Date.now(),
        players: Object.fromEntries(
          Object.entries(room.players || {}).map(([id, player]) => [
            id,
            {
              ...player,
              bestWave: 0,
              finishedAt: undefined,
              forfeitAt: undefined,
              ready: true,
            },
          ]),
        ),
      }

      saveRoom(nextRoom)
      broadcastRoom(roomId)

      // schedule bot simulations for any bots in this room
      for (const id of Object.keys(nextRoom.players || {})) {
        if (isBotId(id)) {
          scheduleBotSimulation(roomId, id)
        }
      }

      return { ok: true, room: cloneRoom(nextRoom) }
    }),
  )

  socket.on(
    "multiplayer:room:add-bot",
    withAck((payload) => {
      const roomId = String(payload?.roomId || "").trim()
      const hostUserId = String(payload?.hostUserId || "").trim()
      const displayName = String(payload?.displayName || "Bot").trim() || "Bot"

      if (!roomId || !hostUserId) {
        return { ok: false, message: "Dados invalidos para adicionar bot" }
      }

      const entry = getRoomEntry(roomId)
      if (!entry) {
        return { ok: false, message: "Sala nao encontrada" }
      }

      const room = entry.room
      if (room.mode !== "casual") {
        return { ok: false, message: "Bots so estao disponíveis no modo casual" }
      }

      if (room.status !== "waiting") {
        return { ok: false, message: "Nao e possivel adicionar bots apos o inicio da sala" }
      }

      if (room.hostUserId !== hostUserId) {
        return { ok: false, message: "Apenas o host pode adicionar bots" }
      }

      if (roomPlayerCount(room) >= room.maxPlayers) {
        return { ok: false, message: "Sala cheia" }
      }

      // generate bot id
      const botId = `BOT_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`
      const nextRoom = {
        ...room,
        players: {
          ...room.players,
          [botId]: {
            userId: botId,
            displayName,
            joinedAt: Date.now(),
            bestWave: 0,
            ready: true,
          },
        },
      }

      saveRoom(nextRoom)
      broadcastRoom(roomId)

      return { ok: true, room: cloneRoom(nextRoom), botId }
    }),
  )

  socket.on(
    "multiplayer:room:kick",
    withAck((payload) => {
      const roomId = String(payload?.roomId || "").trim()
      const hostUserId = String(payload?.hostUserId || "").trim()
      const targetUserId = String(payload?.targetUserId || "").trim()

      if (!roomId || !hostUserId || !targetUserId) {
        return { ok: false, message: "Dados invalidos para expulsar jogador" }
      }

      const entry = getRoomEntry(roomId)
      if (!entry) {
        return { ok: false, message: "Sala nao encontrada" }
      }

      const room = entry.room
      if (room.mode !== "casual") {
        return { ok: false, message: "So e possivel expulsar no modo casual" }
      }

      if (room.hostUserId !== hostUserId) {
        return { ok: false, message: "Apenas o host pode expulsar jogadores" }
      }

      if (targetUserId === room.hostUserId) {
        return { ok: false, message: "Nao podes expulsar o host" }
      }

      removeUserFromRoom(roomId, targetUserId)
      return { ok: true }
    }),
  )

  socket.on(
    "multiplayer:room:update-wave",
    withAck((payload) => {
      const roomId = String(payload?.roomId || "").trim()
      const userId = String(payload?.userId || "").trim()
      const displayName = String(payload?.displayName || "Treinador").trim() || "Treinador"
      const wave = Math.max(0, Number(payload?.wave || 0))
      const entry = getRoomEntry(roomId)

      if (!roomId || !userId) {
        return { ok: false, message: "Dados invalidos para atualizar a wave" }
      }

      if (!entry?.room?.players?.[userId]) {
        return { ok: false, message: "Jogador nao encontrado na sala" }
      }

      const room = entry.room
      const player = room.players[userId]
      const nextRoom = {
        ...room,
        players: {
          ...room.players,
          [userId]: {
            ...player,
            displayName,
            bestWave: Math.max(player.bestWave || 0, wave),
          },
        },
      }

      saveRoom(nextRoom)
      broadcastRoom(roomId)
      return { ok: true }
    }),
  )

  socket.on(
    "multiplayer:room:finish-player",
    withAck((payload) => {
      const roomId = String(payload?.roomId || "").trim()
      const userId = String(payload?.userId || "").trim()
      const wave = Math.max(0, Number(payload?.wave || 0))
      const entry = getRoomEntry(roomId)

      if (!roomId || !userId) {
        return { ok: false, message: "Dados invalidos para finalizar o jogador" }
      }

      if (!entry?.room?.players?.[userId]) {
        return { ok: false, message: "Jogador nao encontrado na sala" }
      }

      const room = entry.room
      const now = Date.now()
      const player = room.players[userId]
      const nextRoom = {
        ...room,
        players: {
          ...room.players,
          [userId]: {
            ...player,
            bestWave: Math.max(player.bestWave || 0, wave),
            finishedAt: player.finishedAt || now,
            ready: false,
          },
        },
      }

      const everyoneFinished = areAllPlayersResolved(nextRoom.players)
      if (everyoneFinished) {
        saveRoom(finalizeFinishedRoom(nextRoom, now))
        broadcastRoom(roomId)
        return { ok: true }
      }

      saveRoom(nextRoom)
      broadcastRoom(roomId)
      return { ok: true }
    }),
  )

  socket.on(
    "multiplayer:room:set-ready",
    withAck((payload) => {
      const roomId = String(payload?.roomId || "").trim()
      const userId = String(payload?.userId || "").trim()
      const ready = Boolean(payload?.ready)

      if (!roomId || !userId) {
        return { ok: false, message: "Dados invalidos para atualizar o estado pronto" }
      }

      const entry = getRoomEntry(roomId)
      if (!entry?.room?.players?.[userId]) {
        return { ok: false, message: "Jogador nao encontrado na sala" }
      }

      const room = entry.room
      const player = room.players[userId]
      if (hasPlayerResolved(player)) {
        return { ok: true }
      }

      const nextRoom = {
        ...room,
        players: {
          ...room.players,
          [userId]: {
            ...player,
            ready,
          },
        },
      }

      saveRoom(nextRoom)
      broadcastRoom(roomId)
      return { ok: true, room: cloneRoom(nextRoom) }
    }),
  )

  socket.on(
    "multiplayer:room:set-starter-mode",
    withAck((payload) => {
      const roomId = String(payload?.roomId || "").trim()
      const userId = String(payload?.userId || "").trim()
      const starterMode = payload?.starterMode === "roulette" ? "roulette" : "manual"

      if (!roomId || !userId) {
        return { ok: false, message: "Dados invalidos para alterar a roleta inicial" }
      }

      const entry = getRoomEntry(roomId)
      if (!entry?.room?.players?.[userId]) {
        return { ok: false, message: "Jogador nao encontrado na sala" }
      }

      const room = entry.room
      if (room.status !== "waiting") {
        return { ok: false, message: "A sala ja comecou" }
      }

      if (room.mode !== "casual") {
        return { ok: false, message: "A roleta inicial nao pode ser alterada neste modo" }
      }

      if (room.hostUserId !== userId) {
        return { ok: false, message: "Apenas o host pode alterar a roleta inicial" }
      }

      const nextRoom = {
        ...room,
        starterMode,
      }

      saveRoom(nextRoom)
      broadcastRoom(roomId)
      return { ok: true, room: cloneRoom(nextRoom) }
    }),
  )

  socket.on(
    "multiplayer:room:rematch",
    withAck((payload) => {
      const roomId = String(payload?.roomId || "").trim()
      const hostUserId = String(payload?.hostUserId || "").trim()

      if (!roomId || !hostUserId) {
        return { ok: false, message: "Dados invalidos para a revanche" }
      }

      const entry = getRoomEntry(roomId)
      if (!entry?.room) {
        return { ok: false, message: "Sala nao encontrada" }
      }

      const room = entry.room
      if (room.status !== "finished") {
        return { ok: false, message: "A sala ainda nao terminou" }
      }

      if (room.mode !== "competitive" && room.hostUserId !== hostUserId) {
        return { ok: false, message: "Apenas o host pode preparar a revanche" }
      }

      const nextRoom = resetRoomForRematch(room)
      saveRoom(nextRoom)
      broadcastRoom(roomId)
      return { ok: true, room: cloneRoom(nextRoom) }
    }),
  )

  socket.on(
    "multiplayer:room:subscribe",
    withAck((payload) => {
      const roomId = String(payload?.roomId || "").trim()
      if (!roomId) {
        return { ok: false, message: "Sala invalida" }
      }

      const entry = getRoomEntry(roomId)
      if (!entry) {
        return { ok: false, message: "Sala nao encontrada" }
      }

      socket.join(roomId)
      return { ok: true, room: cloneRoom(entry.room) }
    }),
  )

  socket.on("multiplayer:room:unsubscribe", (payload) => {
    const roomId = String(payload?.roomId || "").trim()
    if (roomId) {
      socket.leave(roomId)
    }
  })

  socket.on(
    "multiplayer:lobbies:list",
    withAck((payload) => {
      const limitCount = Math.max(1, Number(payload?.limitCount || 30))
      return {
        ok: true,
        lobbies: listPublicCasualLobbies(limitCount),
      }
    }),
  )

  socket.on(
    "multiplayer:competitive:join",
    withAck((payload) => {
      const maxPlayers = payload?.maxPlayers === 3 ? 3 : 2
      const userId = String(payload?.userId || "").trim()
      const displayName = String(payload?.displayName || "Treinador").trim() || "Treinador"

      if (!userId) {
        return { ok: false, message: "userId invalido" }
      }

      removeUserFromOtherRooms(userId)

      const result = joinCompetitiveRoom({
        maxPlayers,
        userId,
        displayName,
      })

      if (result.ok && result.room) {
        socket.data.userId = userId
        socket.data.joinedRoomIds.add(result.room.id)
        socket.join(result.room.id)
      }

      return result
    }),
  )

  socket.on("disconnect", () => {
    const joinedRoomIds = Array.from(socket.data.joinedRoomIds || [])
    const userId = socket.data.userId

    if (userId) {
      for (const roomId of joinedRoomIds) {
        removeUserFromRoom(roomId, userId)
      }
    }

    socket.data.joinedRoomIds = new Set()
  })
})

setInterval(cleanupStaleRooms, 60_000)

httpServer.listen(PORT, () => {
  console.log(`[socket] multiplayer server running on :${PORT}`)
})
