import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("===== CONNECTED SUCCESSFULLY =====");
  } catch (error) {
    console.error("===== CONNECTION ERROR: ", error);
    process.exit(1); // لإنهاء التطبيق في حال فشل الاتصال
  }
};
export default connectDB;
