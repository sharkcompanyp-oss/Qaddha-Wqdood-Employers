import request from "../models/request";
export const Get_Requests = async (req, res) => {
  try {
    const Requests = await request.find();
    if (!Requests || Requests.length == 0) {
      return res.status(404).json({ message: "لا توجد أي طلبات معلقة حاليا" });
    }
    return res.status(200).json(Requests);
  } catch (err) {
    res.status(500).json("حدث خطأ في الخادم.");
  }
};
