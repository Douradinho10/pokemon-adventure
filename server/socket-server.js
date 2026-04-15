const { createServer } = require("http")
const { Server } = require("socket.io")

const PORT = Number(process.env.SOCKET_SERVER_PORT || 4001)
const ORIGIN = process.env.SOCKET_SERVER_ORIGIN || "*"

const httpServer = createServer()
const io = new Server(httpServer, {
  cors: {
    origin: ORIGIN,
    methods: ["GET", "POST"],
  },
})

const queues = {
  2: [],
  3: [],
}

const pendingMatches = new Map()
let matchCounter = 0

function nextMatchId() {
  matchCounter += 1
  return `m_${Date.now()}_${matchCounter}`
}

function removeFromQueues(socketId) {
  queues[2] = queues[2].filter((entry) => entry.socketId !== socketId)
  queues[3] = queues[3].filter((entry) => entry.socketId !== socketId)
}

function removeUserFromQueues(userId) {
  queues[2] = queues[2].filter((entry) => entry.userId !== userId)
  queues[3] = queues[3].filter((entry) => entry.userId !== userId)
}

function enqueueAndTryMatch(size, entry) {
  const queue = queues[size]
  queue.push(entry)

  while (queue.length >= size) {
    const participants = queue.splice(0, size)
    const matchId = nextMatchId()
    const socketIds = participants.map((participant) => participant.socketId)
    const host = participants[0]

    pendingMatches.set(matchId, {
      hostSocketId: host.socketId,
      socketIds,
      roomId: null,
      createdAt: Date.now(),
    })

    participants.forEach((participant, index) => {
      io.to(participant.socketId).emit("competitive:matched", {
        matchId,
        role: index === 0 ? "host" : "guest",
        maxPlayers: size,
      })
    })
  }
}

function cleanupStaleMatches() {
  const now = Date.now()
  for (const [matchId, match] of pendingMatches.entries()) {
    if (now - match.createdAt > 60_000) {
      pendingMatches.delete(matchId)
    }
  }
}

setInterval(cleanupStaleMatches, 10_000)

io.on("connection", (socket) => {
  socket.on("competitive:enqueue", (payload) => {
    try {
      const maxPlayers = payload?.maxPlayers === 3 ? 3 : 2
      const userId = String(payload?.userId || "").trim()
      const displayName = String(payload?.displayName || "Treinador").trim() || "Treinador"

      if (!userId) {
        socket.emit("competitive:error", { message: "userId invalido" })
        return
      }

      removeFromQueues(socket.id)
      removeUserFromQueues(userId)

      enqueueAndTryMatch(maxPlayers, {
        socketId: socket.id,
        userId,
        displayName,
        enqueuedAt: Date.now(),
      })
    } catch (error) {
      socket.emit("competitive:error", {
        message: error instanceof Error ? error.message : "Erro ao entrar na fila websocket",
      })
    }
  })

  socket.on("competitive:room-created", (payload) => {
    const matchId = String(payload?.matchId || "")
    const roomId = String(payload?.roomId || "")
    if (!matchId || !roomId) {
      return
    }

    const match = pendingMatches.get(matchId)
    if (!match) {
      return
    }

    if (match.hostSocketId !== socket.id) {
      return
    }

    match.roomId = roomId

    match.socketIds.forEach((participantSocketId) => {
      io.to(participantSocketId).emit("competitive:room-ready", {
        matchId,
        roomId,
      })
    })

    pendingMatches.delete(matchId)
  })

  socket.on("competitive:cancel", () => {
    removeFromQueues(socket.id)
  })

  socket.on("disconnect", () => {
    removeFromQueues(socket.id)

    for (const [matchId, match] of pendingMatches.entries()) {
      if (match.socketIds.includes(socket.id)) {
        match.socketIds.forEach((participantSocketId) => {
          if (participantSocketId !== socket.id) {
            io.to(participantSocketId).emit("competitive:error", {
              message: "Um jogador saiu da fila antes de abrir a sala",
            })
          }
        })

        pendingMatches.delete(matchId)
      }
    }
  })
})

httpServer.listen(PORT, () => {
  console.log(`[socket] competitive queue server running on :${PORT}`)
})
