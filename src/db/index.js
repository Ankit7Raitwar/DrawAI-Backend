import mongoose from "mongoose";

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error("MONGO_URI is missing in .env");
  }

  const connection = await mongoose.connect(mongoUri);

  console.log(
    `MongoDB connected: ${connection.connection.host}`
  );
};

export default connectDB;
