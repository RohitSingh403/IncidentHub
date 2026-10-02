export function sendOk(res, data, message, status = 200) {
  res.status(status).json({ success: true, data, message });
}
