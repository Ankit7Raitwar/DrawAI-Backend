import Room from "../models/Room.js";

const generateRoomCode = () => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  let code = "";

  for (let i = 0; i < 6; i++) {
    code += characters.charAt(
      Math.floor(Math.random() * characters.length)
    );
  }

  return code;
};

const getUniqueRoomCode = async () => {
  let roomCode;

  do {
    roomCode = generateRoomCode();
  } while (await Room.exists({ roomCode }));

  return roomCode;
};

export const createRoom = async (req, res) => {
  try {
    const username = req.body.username?.trim();

    if (!username) {
      return res.status(400).json({
        success: false,
        message: "Username is required",
      });
    }

    if (username.length > 20) {
      return res.status(400).json({
        success: false,
        message: "Username must be 20 characters or less",
      });
    }

    const roomCode = await getUniqueRoomCode();

    const room = await Room.create({
      roomCode,
      host: username,
      players: [
        {
          username,
          socketId: null,
          score: 0,
        },
      ],
      status: "waiting",
    });

    return res.status(201).json({
      success: true,
      message: "Room created successfully",
      room,
    });
  } catch (error) {
    console.error("Create room error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create room",
    });
  }
};

export const joinRoom = async (req, res) => {
  try {
    const username = req.body.username?.trim();
    const roomCode = req.body.roomCode?.trim().toUpperCase();

    if (!username || !roomCode) {
      return res.status(400).json({
        success: false,
        message: "Username and room code are required",
      });
    }

    const room = await Room.findOne({
      roomCode,
    });

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    if (room.status !== "waiting") {
      return res.status(400).json({
        success: false,
        message: "Game has already started",
      });
    }

    const alreadyExists = room.players.some(
      (player) =>
        player.username.toLowerCase() ===
        username.toLowerCase()
    );

    if (alreadyExists) {
      return res.status(400).json({
        success: false,
        message: "Username is already in this room",
      });
    }

    room.players.push({
      username,
      socketId: null,
      score: 0,
    });

    await room.save();

    return res.status(200).json({
      success: true,
      message: "Joined room successfully",
      room,
    });
  } catch (error) {
    console.error("Join room error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to join room",
    });
  }
};
