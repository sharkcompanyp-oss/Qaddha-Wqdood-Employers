import mongoose from "mongoose";

const connectDB = async () => {
  try {
    await mongoose.connect(
      "mongodb+srv://sharkdigitals:N3GTllwiN8Usq4aW@node-js.ziclaak.mongodb.net/?retryWrites=true&w=majority&appName=Node-JS"
    );
    console.log("===== CONNECTED SUCCESSFULLY =====");
  } catch (error) {
    console.error("===== CONNECTION ERROR: ", error);
    process.exit(1); // لإنهاء التطبيق في حال فشل الاتصال
  }
};
export default connectDB;
