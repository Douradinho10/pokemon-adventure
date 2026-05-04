const { spawn } = require("child_process")
const path = require("path")

function getArgValue(flagName, defaultValue) {
  const index = process.argv.indexOf(flagName)
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1]
  }

  return defaultValue
}

const webPort = String(getArgValue("--port", process.env.PORT || 5000))
const webHost = getArgValue("--host", process.env.HOST || "0.0.0.0")
const socketPort = String(getArgValue("--socket-port", process.env.SOCKET_SERVER_PORT || 4001))
const socketOrigin = getArgValue("--socket-origin", process.env.SOCKET_SERVER_ORIGIN || "*")
const socketServerUrl = getArgValue("--socket-url", `http://127.0.0.1:${socketPort}`)

const nextBin = require.resolve("next/dist/bin/next")
const socketServerPath = path.resolve(__dirname, "../server/socket-server.js")

const sharedEnv = {
  ...process.env,
  NEXT_PUBLIC_SOCKET_SERVER_URL: socketServerUrl,
  SOCKET_SERVER_PORT: socketPort,
  SOCKET_SERVER_ORIGIN: socketOrigin,
}

const processes = [
  {
    name: "next",
    command: process.execPath,
    args: [nextBin, "dev", "-p", webPort, "-H", webHost],
    env: sharedEnv,
  },
  {
    name: "socket",
    command: process.execPath,
    args: [socketServerPath],
    env: sharedEnv,
  },
]

let shuttingDown = false
const children = []

function stopAll(exitCode = 0) {
  if (shuttingDown) {
    return
  }

  shuttingDown = true

  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM")
    }
  }

  setTimeout(() => {
    for (const child of children) {
      if (!child.killed) {
        child.kill("SIGKILL")
      }
    }
    process.exit(exitCode)
  }, 1500).unref()
}

for (const processConfig of processes) {
  const child = spawn(processConfig.command, processConfig.args, {
    env: processConfig.env,
    stdio: "inherit",
    shell: false,
  })

  children.push(child)

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return
    }

    if (code === 0 && !signal) {
      stopAll(0)
      return
    }

    const exitCode = typeof code === "number" ? code : 1
    console.error(`[dev] ${processConfig.name} exited unexpectedly`, signal ? `(${signal})` : `with code ${exitCode}`)
    stopAll(exitCode)
  })

  child.on("error", (error) => {
    if (shuttingDown) {
      return
    }

    console.error(`[dev] failed to start ${processConfig.name}:`, error)
    stopAll(1)
  })
}

function handleShutdown() {
  stopAll(0)
}

process.on("SIGINT", handleShutdown)
process.on("SIGTERM", handleShutdown)
process.on("exit", () => {
  shuttingDown = true
})

console.log(`[dev] starting Next on :${webPort} and Socket.io on :${socketPort}`)
