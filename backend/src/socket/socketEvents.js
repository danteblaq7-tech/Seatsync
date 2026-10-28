export const roomNames = {
  user: userId => `user:${userId}`,
  role: role => `role:${role}`,
  module: moduleName => `module:${moduleName}`,
  venue: venueId => `venue:${venueId}`,
  timetable: timetableId => `timetable:${timetableId}`
}

export const joinRoom = (socket, roomName) => {
  if (!socket || !roomName) return false
  socket.join(roomName)
  console.log(`[SOCKET][JOIN] socket=${socket.id} room=${roomName}`)
  return true
}

export const leaveRoom = (socket, roomName) => {
  if (!socket || !roomName) return false
  socket.leave(roomName)
  console.log(`[SOCKET][LEAVE] socket=${socket.id} room=${roomName}`)
  return true
}

export const emitSocketEvent = (event, payload, roomName = null) => {
  const io = globalThis.__SEATSYNC_IO__
  if (!io) {
    console.warn('[SOCKET][WARN] io unavailable for event:', event)
    return payload
  }

  if (roomName) {
    io.to(roomName).emit(event, payload)
    console.log(`[SOCKET][EMIT] event=${event} room=${roomName}`)
    return payload
  }

  io.emit(event, payload)
  console.log(`[SOCKET][EMIT] event=${event} broadcast=true`)
  return payload
}

export const emitToUser = (userId, event, payload) => {
  const room = roomNames.user(userId)
  emitSocketEvent(event, payload, room)
}

export const emitToRole = (role, event, payload) => {
  const room = roomNames.role(role)
  emitSocketEvent(event, payload, room)
}

export const installSocketHandlers = io => {
  io.on('connection', socket => {
    console.log(`[SOCKET][CONNECT] socket=${socket.id}`)

    socket.emit('welcome', {
      message: 'Connected to SeatSync realtime service',
      socketId: socket.id
    })

    socket.on('join:user', userId => {
      if (!userId) {
        console.warn(
          `[SOCKET][WARN] join:user missing userId for socket=${socket.id}`
        )
        return
      }
      joinRoom(socket, roomNames.user(userId))
    })

    socket.on('join:role', role => {
      if (!role) {
        console.warn(
          `[SOCKET][WARN] join:role missing role for socket=${socket.id}`
        )
        return
      }
      joinRoom(socket, roomNames.role(role))
    })

    socket.on('join:module', moduleName => {
      if (!moduleName) {
        console.warn(
          `[SOCKET][WARN] join:module missing module for socket=${socket.id}`
        )
        return
      }
      joinRoom(socket, roomNames.module(moduleName))
    })

    socket.on('leave:room', roomName => {
      leaveRoom(socket, roomName)
    })

    socket.on('disconnect', reason => {
      console.log(`[SOCKET][DISCONNECT] socket=${socket.id} reason=${reason}`)
    })

    socket.on('error', error => {
      console.error(`[SOCKET][ERROR] socket=${socket.id}`, error)
    })
  })
}
