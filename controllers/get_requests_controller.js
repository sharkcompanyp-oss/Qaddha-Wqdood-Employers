import request from "../models/request.js";
import Subjects from "../models/exam.js";

export const Get_Requests = async (req, res) => {
  try {
    const Requests = await request.find();

    if (!Requests || Requests.length === 0) {
      return res.status(404).json({ message: "لا توجد طلبات معلقة حالياً" });
    }

    const enriched = await Promise.all(
      Requests.map(async (req_item) => {
        const exams = await Subjects.find(
          { _id: { $in: req_item.exams_ids } },
          { name: 1, price: 1 },
        );

        return {
          ...req_item.toObject(),
          exams_details: exams.map((e) => ({
            _id: e._id,
            name: e.name,
            price: e.price,
          })),
        };
      }),
    );

    return res.status(200).json(enriched);
  } catch (err) {
    res.status(500).json("حدث خطأ في الخادم.");
  }
};
