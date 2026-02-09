import Admins from "../models/admin.js"; // تأكد من الاسم الصحيح

dotenv.config();

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const set_price_for_question = async (req, res) => {
  try {
    const { _id, new_price } = req.body;

    if (!_id) {
      return res.status(400).json({ message: "رمز الأدمن ناقص" });
    }
    const The_Admin = await Admins.findOne({
      _id: _id,
    });
    if (!The_Admin) {
      return res.status(404).json({ message: "الأدمن غير موجود" });
    }

    The_Admin.price_for_question = new_price;

    await The_Admin.save();

    res.status(200).json({ message: "تم تحديث سعر السؤال بنجاح" });
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ message: "تحقق من اتصالك بالانترنت", error: error.message });
  }
};
