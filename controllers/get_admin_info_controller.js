/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
import Admin from "../models/Admin.js";

export const Get_Admin_Info = async (req, res) => {
  try {
    let The_Admin = await Admin.findOne(); // جلب أول أدمن

    // إذا ما في بيانات، منضيف الأدمن لأول مرة
    if (!The_Admin) {
      The_Admin = new Admin({
        name: "رشيد حداد",
        password: "Rh3Cr7Rh3Cr7",
        total_profit: 490000,
        profits: [],
      });
      await The_Admin.save();
    }

    res.status(200).json(The_Admin);
  } catch (error) {
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
};
