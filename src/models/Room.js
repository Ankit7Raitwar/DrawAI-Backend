import mongoose from "mongoose";

const playerSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
    },

    socketId: {
      type: String,
      default: null,
    },

    score: {
      type: Number,
      default: 0,
    },
  },
  {
    _id: true,
  }
);

const roomSchema = new mongoose.Schema(
  {
    roomCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },

    host: {
      type: String,
      required: true,
      trim: true,
    },

    players: {
      type: [playerSchema],
      default: [],
    },

    status: {
      type: String,
      enum: ["waiting", "playing", "finished"],
      default: "waiting",
    },
  },
  {
    timestamps: true,
  }
);

const Room = mongoose.model("Room", roomSchema);

export default Room;
