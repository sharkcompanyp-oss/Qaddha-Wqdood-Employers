import request from "../models/request.js";
import Subjects from "../models/exam.js";

export const Get_Requests = async (req, res) => {
  try {
    const { status } = req.body;

    // فلترة حسب الحالة إذا موجودة
    const query = status ? { status } : {};

    const Requests = await request.find(query);

    if (!Requests || Requests.length === 0) {
      return res.status(404).json({ message: "لا توجد طلبات" });
    }

    const enriched = await Promise.all(
      Requests.map(async (req_item) => {
        const exams = await Subjects.find(
          { _id: { $in: req_item.exams_ids } },
          { name: 1, price: 1, price_moadal: 1 },
        );

        // الخطة المطلوبة لكل مادة، وسعرها المقابل لها.
        // بدونها يرى المشرف اسم المادة وسعر «ترفيع» دائماً، فلا يعرف أن
        // الطالب دفع ثمن «معدل» — وهو أغلى — ولا يستطيع التحقّق من المبلغ.
        const tierOf = new Map(
          (req_item.tiers || []).map((t) => [String(t.exam_id), t.tier]),
        );

        return {
          ...req_item.toObject(),
          exams_details: exams.map((e) => {
            const tier = tierOf.get(String(e._id)) || "tarfee";
            return {
              _id: e._id,
              name: e.name,
              tier,
              tier_label: tier === "moadal" ? "معدل" : "ترفيع",
              price: tier === "moadal" ? e.price_moadal || 0 : e.price || 0,
            };
          }),
        };
      }),
    );

    return res.status(200).json(enriched);
  } catch (err) {
    res.status(500).json("حدث خطأ في الخادم.");
  }
};
