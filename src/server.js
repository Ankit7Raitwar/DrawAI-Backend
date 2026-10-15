import dotenv from "dotenv";
import connectDB from "./db/index.js";
import { createServer } from "http";
import { app } from "./app.js";
import { Server } from "socket.io";
import Room from "./models/Room.js";

import {
  createGame,
  getGame,
  getCurrentDrawer,
  getWordProgress,
  revealNextCharacter,
  finishGame,
  getGameWinners,
  deleteGame,
  startNextRound,
  selectWord,
  validateGameSettings,
} from "./game/gameManager.js";

const wordRevealTimers = new Map();
const roundTimers = new Map();

const clearWordRevealTimer = (roomCode) => {
  const timer = wordRevealTimers.get(roomCode);

  if (timer) {
    clearInterval(timer);
    wordRevealTimers.delete(roomCode);
  }
};

const clearRoundTimer = (roomCode) => {
  const timer = roundTimers.get(roomCode);

  if (timer) {
    clearInterval(timer);
    roundTimers.delete(roomCode);
  }
};

dotenv.config({
  path: "./.env",
});

const httpServer = createServer(app);

const clientUrl =
  process.env.CLIENT_URL || "http://localhost:5173";

const io = new Server(httpServer, {
  cors: {
    origin: clientUrl,
    methods: ["GET", "POST"],
  },
});

const finishRound = async (roomCode, winnerUsername, reason) => {
  const game = finishGame(roomCode, winnerUsername, reason);

  if (!game) {
    return;
  }

  clearRoundTimer(roomCode);
  clearWordRevealTimer(roomCode);

  if (game.round >= game.totalRounds) {
    try {
      const deletion = await Room.deleteOne({ roomCode });

      if (deletion.deletedCount !== 1) {
        throw new Error(`Room ${roomCode} was not found during final cleanup`);
      }

      io.to(roomCode).emit("game-finished", {
        players: game.players,
        result: game.result,
        winners: getGameWinners(game),
        round: game.round,
        totalRounds: game.totalRounds,
      });
      io.in(roomCode).socketsLeave(roomCode);
      deleteGame(roomCode);
    } catch (error) {
      console.error("Final game cleanup error:", error);
      io.to(roomCode).emit("game-error", {
        message: "The final result could not be saved. Please try again.",
      });
    }

    return;
  }

  io.to(roomCode).emit("game-ended", {
    status: game.status,
    players: game.players,
    timeLeft: game.timeLeft,
    result: game.result,
    maskedWord: getWordProgress(game),
  });
};

const startRoundTimer = (roomCode) => {
  clearRoundTimer(roomCode);
  let lastTimeLeft = 60;

  const timer = setInterval(() => {
    const game = getGame(roomCode);

    if (!game || game.status !== "playing" || !game.endsAt) {
      clearRoundTimer(roomCode);
      return;
    }

    const timeLeft = Math.max(
      0,
      Math.ceil((game.endsAt - Date.now()) / 1000)
    );

    if (timeLeft === 0) {
      finishRound(roomCode, null, "time-up");
      return;
    }

    if (timeLeft !== lastTimeLeft) {
      lastTimeLeft = timeLeft;
      game.timeLeft = timeLeft;
      io.to(roomCode).emit("game-timer", { timeLeft });
    }
  }, 250);

  roundTimers.set(roomCode, timer);
};

io.on("connection", (socket) => {
  console.log("USER CONNECTED:", socket.id);

  // ========================================
  // JOIN ROOM
  // ========================================

  socket.on("join-room", async ({ roomCode, username }, acknowledge = () => {}) => {
    try {
      const cleanRoomCode = roomCode?.trim().toUpperCase();
      const cleanUsername = username?.trim();

      console.log("JOIN ROOM:", {
        socketId: socket.id,
        roomCode: cleanRoomCode,
        username: cleanUsername,
      });

      const room = await Room.findOne({
        roomCode: cleanRoomCode,
      });

      if (!room) {
        socket.emit("room-error", {
          message: "Room not found",
        });
        acknowledge({ success: false, message: "Room not found" });

        return;
      }

      const player = room.players.find(
        (item) =>
          item.username.toLowerCase() ===
          cleanUsername.toLowerCase()
      );

      if (!player) {
        socket.emit("room-error", {
          message: "Player not found in this room",
        });
        acknowledge({
          success: false,
          message: "Player not found in this room",
        });

        return;
      }

      player.socketId = socket.id;

      await room.save();

      socket.join(cleanRoomCode);

      const game = getGame(cleanRoomCode);
      const gamePlayer = game?.players.find(
        (item) => item.username === cleanUsername
      );
      if (gamePlayer) {
        gamePlayer.socketId = socket.id;

        if (getCurrentDrawer(game)?.username === gamePlayer.username) {
          if (game.status === "choosing-word") {
            socket.emit("word-options", {
              words: game.wordOptions,
            });
          } else if (game.status === "playing" && game.currentWord) {
            socket.emit("your-word", {
              word: game.currentWord,
            });
          }
        }
      }

      io.to(cleanRoomCode).emit("room-updated", {
        roomCode: room.roomCode,
        host: room.host,
        players: room.players,
        status: room.status,
      });
      acknowledge({ success: true });

      console.log(
        `PLAYER JOINED: ${cleanUsername} -> ${cleanRoomCode}`
      );
    } catch (error) {
      console.error("Join room error:", error);
      acknowledge({ success: false, message: "Unable to join room" });

      socket.emit("room-error", {
        message: "Unable to join room",
      });
    }
  });

  // ========================================
  // START GAME
  // ========================================

  socket.on(
    "start-game",
    async ({ roomCode, username, settings }) => {
      const cleanRoomCode = roomCode?.trim().toUpperCase();
      let gameCreated = false;

      try {
        const cleanUsername = username?.trim();

        const room = await Room.findOne({
          roomCode: cleanRoomCode,
        });

        if (!room) {
          socket.emit("game-error", {
            message: "Room not found",
          });

          return;
        }

        if (room.players.length < 2) {
          socket.emit("game-error", {
            message: "At least 2 players are required",
          });

          return;
        }

        const startingPlayer = room.players.find(
          (player) => player.username === room.host
        );
        if (
          cleanUsername !== room.host ||
          startingPlayer?.socketId !== socket.id ||
          !socket.rooms.has(cleanRoomCode) ||
          getGame(cleanRoomCode)
        ) {
          socket.emit("game-error", {
            message: "Only the room host can start the first round",
          });
          return;
        }

        const gameSettings = validateGameSettings(settings);
        const game = createGame(
          cleanRoomCode,
          room.players,
          room.host,
          gameSettings
        );
        gameCreated = true;
        room.status = "playing";
        await room.save();

        clearWordRevealTimer(cleanRoomCode);
        clearRoundTimer(cleanRoomCode);

        const drawer = getCurrentDrawer(game);

        if (!drawer) {
          socket.emit("game-error", {
            message: "Unable to select drawer",
          });

          return;
        }

        io.to(cleanRoomCode).emit("game-started", {
          roomCode: cleanRoomCode,
          players: game.players,
          currentDrawer: drawer.username,
          round: game.round,
          totalRounds: game.totalRounds,
          settings: game.settings,
          timeLeft: game.timeLeft,
          status: game.status,
          maskedWord: getWordProgress(game),
          host: game.host,
          result: game.result,
        });

        if (drawer.socketId) {
          io.to(drawer.socketId).emit("word-options", {
            words: game.wordOptions,
          });
        }

        console.log(
          `GAME STARTED: ${cleanRoomCode}`
        );
      } catch (error) {
        console.error("Start game error:", error);
        if (gameCreated) {
          deleteGame(cleanRoomCode);
        }

        socket.emit("game-error", {
          message: error.message || "Failed to start game",
        });
      }
    }
  );

  // ========================================
  // GET GAME STATE
  // ========================================

  socket.on("get-game-state", ({ roomCode }) => {
    try {
      const cleanRoomCode = roomCode?.trim().toUpperCase();

      const game = getGame(cleanRoomCode);

      if (!game) {
        socket.emit("game-error", {
          message: "Game not found",
        });

        return;
      }

      const drawer = getCurrentDrawer(game);

      socket.emit("game-state", {
        roomCode: game.roomCode,
        players: game.players,
        currentDrawer: drawer?.username || "",
        round: game.round,
        totalRounds: game.totalRounds,
        settings: game.settings,
        timeLeft:
          game.status === "playing" && game.endsAt
            ? Math.max(0, Math.ceil((game.endsAt - Date.now()) / 1000))
            : game.timeLeft,
        status: game.status,
        maskedWord: getWordProgress(game),
        host: game.host,
        result: game.result,
      });

      // If this socket is the drawer and word selection is still active,
      // send its private word options.
      if (
        drawer?.socketId === socket.id &&
        game.status === "choosing-word"
      ) {
        socket.emit("word-options", {
          words: game.wordOptions,
        });
      }
    } catch (error) {
      console.error(
        "Get game state error:",
        error
      );
    }
  });

  // ========================================
  // SELECT WORD
  // ========================================

  socket.on(
    "select-word",
    ({ roomCode, username, word }) => {
      try {
        const cleanRoomCode = roomCode?.trim().toUpperCase();
        const cleanUsername = username?.trim();
        const cleanWord = word?.trim().toLowerCase();

        const game = getGame(cleanRoomCode);

        if (!game) {
          socket.emit("game-error", {
            message: "Game not found",
          });

          return;
        }

        const drawer = getCurrentDrawer(game);

        if (!drawer) {
          socket.emit("game-error", {
            message: "Drawer not found",
          });

          return;
        }

        if (drawer.username !== cleanUsername) {
          socket.emit("game-error", {
            message: "Only the drawer can select a word",
          });

          return;
        }

        if (!game.wordOptions.includes(cleanWord)) {
          socket.emit("game-error", {
            message: "Invalid word selection",
          });

          return;
        }

        const updatedGame = selectWord(
          cleanRoomCode,
          cleanWord
        );
        clearRoundTimer(cleanRoomCode);
        clearWordRevealTimer(cleanRoomCode);

        // Everyone receives only the word length.
        io.to(cleanRoomCode).emit("word-selected", {
          wordLength: cleanWord.length,
          maskedWord: getWordProgress(updatedGame),
          timeLeft: updatedGame.timeLeft,
          currentDrawer: drawer.username,
          status: updatedGame.status,
        });

        // Only drawer receives the real word.
        socket.emit("your-word", {
          word: cleanWord,
        });

        const timer = setInterval(() => {
          const currentGame = getGame(cleanRoomCode);

          if (!currentGame || currentGame.status !== "playing") {
            clearWordRevealTimer(cleanRoomCode);
            return;
          }

          const maskedWord = revealNextCharacter(cleanRoomCode);

          if (maskedWord === null) {
            clearWordRevealTimer(cleanRoomCode);
            return;
          }

          io.to(cleanRoomCode).emit("word-revealed", {
            maskedWord,
          });
        }, 20_000);
        wordRevealTimers.set(cleanRoomCode, timer);
        startRoundTimer(cleanRoomCode);

        console.log(
          `WORD SELECTED in ${cleanRoomCode}: ${cleanWord}`
        );
      } catch (error) {
        console.error(
          "Select word error:",
          error
        );
      }
    }
  );

  // ========================================
  // CHAT GUESSES
  // ========================================

  socket.on("chat-message", (data) => {
    const { roomCode, username, message } =
      data && typeof data === "object" ? data : {};

    if (
      typeof roomCode !== "string" ||
      typeof username !== "string" ||
      typeof message !== "string"
    ) {
      socket.emit("chat-error", {
        message: "Unable to send that guess. Rejoin the game and try again.",
      });
      return;
    }

    const cleanRoomCode = roomCode?.trim().toUpperCase();
    const cleanUsername = username?.trim();
    const cleanMessage = message?.trim();
    const game = getGame(cleanRoomCode);
    const player = game?.players.find(
      (item) =>
        item.username === cleanUsername &&
        item.socketId === socket.id
    );

    if (
      !cleanRoomCode ||
      !cleanUsername ||
      !cleanMessage ||
      cleanMessage.length > 200 ||
      !socket.rooms.has(cleanRoomCode) ||
      !game ||
      game.status !== "playing" ||
      !player
    ) {
      socket.emit("chat-error", {
        message: "Unable to send that guess. Rejoin the game and try again.",
      });
      return;
    }

    io.to(cleanRoomCode).emit("chat-message", {
      id: `${Date.now()}-${socket.id}`,
      username: player.username,
      message: cleanMessage,
      timestamp: Date.now(),
    });

    const drawer = getCurrentDrawer(game);
    if (
      player.username !== drawer?.username &&
      cleanMessage.toLowerCase() === game.currentWord
    ) {
      finishRound(cleanRoomCode, player.username, "guessed");
    }
  });

  socket.on("new-game", (data) => {
    const { roomCode, username } =
      data && typeof data === "object" ? data : {};

    if (typeof roomCode !== "string" || typeof username !== "string") {
      socket.emit("game-error", { message: "Invalid new game request" });
      return;
    }

    const cleanRoomCode = roomCode.trim().toUpperCase();
    const cleanUsername = username.trim();
    const previousGame = getGame(cleanRoomCode);
    const currentDrawerIndex = previousGame?.currentDrawerIndex ?? -1;
    const nextDrawer = previousGame?.players[
      (currentDrawerIndex + 1) % (previousGame.players.length || 1)
    ];

    if (
      !previousGame ||
      previousGame.status !== "round-over" ||
      previousGame.round >= previousGame.totalRounds ||
      nextDrawer?.username !== cleanUsername ||
      nextDrawer.socketId !== socket.id ||
      !socket.rooms.has(cleanRoomCode)
    ) {
      socket.emit("game-error", {
        message: "Only the next drawer can start the next round",
      });
      return;
    }

    try {
      const game = startNextRound(cleanRoomCode);
      if (!game) {
        socket.emit("game-error", {
          message: "Unable to start the next round",
        });
        return;
      }

      clearWordRevealTimer(cleanRoomCode);
      clearRoundTimer(cleanRoomCode);

      const drawer = getCurrentDrawer(game);
      io.to(cleanRoomCode).emit("clear-canvas");
      io.to(cleanRoomCode).emit("game-started", {
        roomCode: cleanRoomCode,
        players: game.players,
        currentDrawer: drawer?.username || "",
        round: game.round,
        totalRounds: game.totalRounds,
        settings: game.settings,
        timeLeft: game.timeLeft,
        status: game.status,
        maskedWord: getWordProgress(game),
        host: game.host,
        result: game.result,
      });

      if (drawer?.socketId) {
        io.to(drawer.socketId).emit("word-options", {
          words: game.wordOptions,
        });
      }
    } catch (error) {
      console.error("New game error:", error);
      socket.emit("game-error", {
        message: "Failed to start a new game",
      });
    }
  });

  // ========================================
  // DRAW LINE
  // ========================================

  socket.on(
    "draw-line",
    ({ roomCode, ...data }) => {
      const cleanRoomCode =
        roomCode?.trim().toUpperCase();

      socket
        .to(cleanRoomCode)
        .emit("draw-line", data);
    }
  );

  // ========================================
  // CLEAR CANVAS
  // ========================================

  socket.on(
    "clear-canvas",
    ({ roomCode }) => {
      const cleanRoomCode =
        roomCode?.trim().toUpperCase();

      socket
        .to(cleanRoomCode)
        .emit("clear-canvas");
    }
  );

  // ========================================
  // DISCONNECT
  // ========================================

  socket.on("disconnect", async () => {
    console.log(
      "USER DISCONNECTED:",
      socket.id
    );

    try {
      const room = await Room.findOne({
        "players.socketId": socket.id,
      });

      if (!room) {
        return;
      }

      const disconnectedPlayer =
        room.players.find(
          (player) =>
            player.socketId === socket.id
        );

      room.players = room.players.filter(
        (player) =>
          player.socketId !== socket.id
      );

      if (
        disconnectedPlayer &&
        room.host === disconnectedPlayer.username &&
        room.players.length > 0
      ) {
        room.host = room.players[0].username;
      }

      await room.save();

      io.to(room.roomCode).emit(
        "room-updated",
        {
          roomCode: room.roomCode,
          host: room.host,
          players: room.players,
          status: room.status,
        }
      );
    } catch (error) {
      console.error(
        "Disconnect error:",
        error
      );
    }
  });
});

connectDB()
  .then(() => {
    const port =
      Number(process.env.PORT) || 8000;

    httpServer.listen(port, () => {
      console.log(
        `DrawAI server is running at http://localhost:${port}`
      );
    });
  })
  .catch((error) => {
    console.error(
      "MongoDB connection failed:",
      error
    );
  });
