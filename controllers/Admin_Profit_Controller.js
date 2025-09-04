/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
import Admin from "../models/Admin.js";

export const Total_Profit_Edit = async (req, res) => {
  const { method, amount } = req.body;

  try {
    let The_Admin = await Admin.findOne(); // جلب أول أدمن

    if (method == "plus") {
      The_Admin.total_profit += amount;
      await The_Admin.save();
    }
    if (method == "minus") {
      The_Admin.total_profit -= amount;
      await The_Admin.save();
    }

    res.status(200).json(The_Admin);
  } catch (error) {
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
};
