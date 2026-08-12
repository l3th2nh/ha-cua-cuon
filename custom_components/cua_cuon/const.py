"""Hằng số cho tích hợp Cửa cuốn."""
DOMAIN = "cua_cuon"

CONF_SENSOR = "sensor"                  # entity_id cảm biến cửa (binary_sensor hoặc cover)
CONF_NOTIFY = "notify_service"          # dịch vụ notify, vd: notify.mobile_app_iphone
CONF_INVERT = "invert"                  # đảo trạng thái (cảm biến báo ngược: on = đóng)
CONF_MSG_OPEN = "msg_open"
CONF_MSG_CLOSE = "msg_close"
CONF_MSG_ALERT = "msg_alert"
CONF_ALERT_MINUTES = "alert_minutes"    # mở quá N phút -> cảnh báo (0 = tắt)
CONF_REPEAT_MINUTES = "repeat_minutes"  # nhắc lại mỗi N phút tới khi đóng (0 = chỉ nhắc 1 lần)
CONF_DEBOUNCE = "debounce"              # chống rung: trạng thái phải giữ N giây mới tính

# {time} = giờ, {date} = ngày, {duration} = thời gian cửa đã mở
DEFAULT_MSG_OPEN = "🔓 Cửa cuốn vừa MỞ lúc {time}"
DEFAULT_MSG_CLOSE = "🔒 Cửa cuốn đã ĐÓNG lúc {time} · mở trong {duration}"
DEFAULT_MSG_ALERT = "⏰ Cửa cuốn đã mở {duration} mà chưa đóng!"

DEFAULT_ALERT_MINUTES = 15
DEFAULT_REPEAT_MINUTES = 5
DEFAULT_DEBOUNCE = 3

NOTIFY_TITLE = "🚪 Cửa cuốn"
NOTIFY_TAG = "cua-cuon"   # cùng 1 tag -> thông báo mới THAY thông báo cũ (không dồn đống)

MAX_LOG = 500             # số lượt mở/đóng lưu tối đa

# Chốt tay 1 lượt bị thiếu điểm đầu/cuối (cảm biến lọt tín hiệu): bù thêm/bớt bấy nhiêu giây.
MANUAL_GAP_SECONDS = 60
