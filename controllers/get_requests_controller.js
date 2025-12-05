import request from "../models/request";
export const Get_Requests = async (req, res) => {
  try {
    const Requests = await request.find();
    res.status(200).json(Requests);
  } catch (err) {
    res.status(500).json("حدث خطأ في الخادم.");
  }
};
