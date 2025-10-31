const { Server } = require('socket.io');
const { verifyToken } = require('../lib/jwt');
const cfg = require('../config');

let io = null;

/**
 * Initialize Socket.IO server
 * @param {http.Server} server - HTTP server instance
 */
function initializeSocket(server) {
  io = new Server(server, {
    cors: {
      origin: cfg.corsOrigins,
      credentials: true
    },
    path: '/socket.io'
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      // Verify JWT token
      const decoded = verifyToken(token);
      socket.userId = decoded.sub;
      socket.userRole = decoded.role;
      socket.userEmail = decoded.email;
      
      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  // Admin namespace
  const adminNamespace = io.of('/admin');
  adminNamespace.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = verifyToken(token);
      socket.userId = decoded.sub;
      socket.userRole = decoded.role;
      socket.userEmail = decoded.email;
      
      if (socket.userRole !== 'admin') {
        return next(new Error('Authorization error: Admin access required'));
      }
      
      next();
    } catch (error) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  adminNamespace.on('connection', (socket) => {
    console.log(`Admin connected: ${socket.userEmail} (${socket.id})`);

    socket.on('disconnect', () => {
      console.log(`Admin disconnected: ${socket.userEmail}`);
    });
  });

  // Inbound namespace
  const inboundNamespace = io.of('/inbound');
  inboundNamespace.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = verifyToken(token);
      socket.userId = decoded.sub;
      socket.userRole = decoded.role;
      socket.userEmail = decoded.email;
      
      if (socket.userRole !== 'inbound') {
        return next(new Error('Authorization error: Inbound user access required'));
      }
      
      next();
    } catch (error) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  inboundNamespace.on('connection', (socket) => {
    console.log(`Inbound user connected: ${socket.userEmail} (${socket.id})`);

    // Join user's personal room
    socket.join(`user:${socket.userId}`);

    socket.on('disconnect', () => {
      console.log(`Inbound user disconnected: ${socket.userEmail}`);
    });
  });

  // Outbound namespace
  const outboundNamespace = io.of('/outbound');
  outboundNamespace.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = verifyToken(token);
      socket.userId = decoded.sub;
      socket.userRole = decoded.role;
      socket.userEmail = decoded.email;
      
      if (socket.userRole !== 'outbound') {
        return next(new Error('Authorization error: Outbound user access required'));
      }
      
      next();
    } catch (error) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  outboundNamespace.on('connection', (socket) => {
    console.log(`Outbound user connected: ${socket.userEmail} (${socket.id})`);

    // Join user's personal room
    socket.join(`user:${socket.userId}`);

    socket.on('disconnect', () => {
      console.log(`Outbound user disconnected: ${socket.userEmail}`);
    });
  });

  console.log('Socket.IO initialized successfully');
  return io;
}

/**
 * Get Socket.IO instance
 */
function getIO() {
  if (!io) {
    throw new Error('Socket.IO not initialized. Call initializeSocket first.');
  }
  return io;
}

/**
 * Emit event to admin namespace
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
function emitToAdmin(event, data) {
  if (!io) return;
  io.of('/admin').emit(event, data);
}

/**
 * Emit event to specific inbound user
 * @param {string} userId - User ID
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
function emitToInboundUser(userId, event, data) {
  if (!io) return;
  io.of('/inbound').to(`user:${userId}`).emit(event, data);
}

/**
 * Emit event to specific outbound user
 * @param {string} userId - User ID
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
function emitToOutboundUser(userId, event, data) {
  if (!io) return;
  io.of('/outbound').to(`user:${userId}`).emit(event, data);
}

/**
 * Emit event to all inbound users
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
function emitToAllInbound(event, data) {
  if (!io) return;
  io.of('/inbound').emit(event, data);
}

/**
 * Emit event to all outbound users
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
function emitToAllOutbound(event, data) {
  if (!io) return;
  io.of('/outbound').emit(event, data);
}

module.exports = {
  initializeSocket,
  getIO,
  emitToAdmin,
  emitToInboundUser,
  emitToOutboundUser,
  emitToAllInbound,
  emitToAllOutbound
};

