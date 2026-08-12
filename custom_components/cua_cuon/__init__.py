"""Cửa cuốn — bắt sự kiện đóng/mở, gửi thông báo + ghi nhật ký thời lượng + panel sidebar.

Theo dõi 1 entity cảm biến cửa (binary_sensor contact, hoặc cover). Khi cửa:
  · MỞ    -> ghi 1 "lượt mở" mới vào nhật ký + thông báo về điện thoại,
  · ĐÓNG  -> chốt lượt mở đó (tính thời lượng) + thông báo kèm "mở trong bao lâu",
  · mở quá N phút -> cảnh báo, nhắc lặp lại tới khi đóng.

Panel "Cửa cuốn" trên sidebar: trạng thái hiện tại (đang mở bao lâu) + nhật ký từng lượt
(giờ mở, giờ đóng, thời lượng), gom nhóm theo ngày. Bấm vào thông báo -> mở thẳng panel.
"""
import logging
import os
from datetime import datetime, timedelta

import voluptuous as vol

from homeassistant.components import frontend, panel_custom, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.event import (
    async_call_later,
    async_track_point_in_time,
    async_track_state_change_event,
    async_track_time_interval,
)
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import (
    CONF_ALERT_MINUTES,
    CONF_DEBOUNCE,
    CONF_INVERT,
    CONF_MSG_ALERT,
    CONF_MSG_CLOSE,
    CONF_MSG_OPEN,
    CONF_NOTIFY,
    CONF_REPEAT_MINUTES,
    CONF_SENSOR,
    DEFAULT_ALERT_MINUTES,
    DEFAULT_DEBOUNCE,
    DEFAULT_MSG_ALERT,
    DEFAULT_MSG_CLOSE,
    DEFAULT_MSG_OPEN,
    DEFAULT_REPEAT_MINUTES,
    DOMAIN,
    MANUAL_GAP_SECONDS,
    MAX_LOG,
    NOTIFY_TAG,
    NOTIFY_TITLE,
)

_LOGGER = logging.getLogger(__name__)

PANEL_URL = "/cua_cuon/panel.js"
PANEL_VER = "3"  # tăng mỗi lần sửa panel.js để chống cache trình duyệt
PANEL_URL_V = f"{PANEL_URL}?v={PANEL_VER}"
PANEL_PATH = "cua-cuon"

# Lưới an toàn: cứ mỗi chu kỳ này lại đối chiếu trạng thái thật của cảm biến với trạng thái
# tích hợp đang giữ. Nếu lệch (sự kiện state_changed bị lọt) thì vá lại ngay.
POLL_INTERVAL = timedelta(seconds=60)

STATE_CLOSED = ("off", "closed")
STATE_OPEN = ("on", "open", "opening", "closing")


def fmt_duration(seconds: float | None) -> str:
    """Đổi số giây -> chuỗi tiếng Việt gọn: '45 giây', '12 phút', '2 giờ 5 phút'."""
    if seconds is None:
        return "—"
    total = int(max(0, seconds))
    if total < 60:
        return f"{total} giây"
    minutes, secs = divmod(total, 60)
    if minutes < 60:
        return f"{minutes} phút {secs} giây" if secs and minutes < 10 else f"{minutes} phút"
    hours, minutes = divmod(minutes, 60)
    return f"{hours} giờ {minutes} phút" if minutes else f"{hours} giờ"


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    panel_js = os.path.join(os.path.dirname(__file__), "panel.js")

    store = Store(hass, 1, DOMAIN)
    data = hass.data.setdefault(DOMAIN, {})
    data["store"] = store
    data["log"] = (await store.async_load()) or {"sessions": []}

    # Phục vụ file JS của panel (chỉ 1 lần / phiên HA)
    if not data.get("static_registered"):
        data["static_registered"] = True
        await hass.http.async_register_static_paths(
            [StaticPathConfig(PANEL_URL, panel_js, False)]
        )

    # Panel trên sidebar
    if PANEL_PATH not in hass.data.get(frontend.DATA_PANELS, {}):
        await panel_custom.async_register_panel(
            hass,
            frontend_url_path=PANEL_PATH,
            webcomponent_name="cua-cuon-panel",
            module_url=PANEL_URL_V,
            sidebar_title="Cửa cuốn",
            sidebar_icon="mdi:garage-variant",
            require_admin=False,
            config={},
        )

    # Lệnh WebSocket cho panel (chỉ đăng ký 1 lần)
    if not data.get("ws_registered"):
        data["ws_registered"] = True
        websocket_api.async_register_command(hass, ws_get_log)
        websocket_api.async_register_command(hass, ws_clear_log)
        websocket_api.async_register_command(hass, ws_finish)

    # Cấu hình hiệu lực = data (lúc cài) chồng bởi options (sửa sau qua Configure)
    conf = {**entry.data, **entry.options}
    sensor_id = conf.get(CONF_SENSOR)
    notify_service = conf.get(CONF_NOTIFY)
    invert = bool(conf.get(CONF_INVERT, False))
    msg_open = conf.get(CONF_MSG_OPEN) or DEFAULT_MSG_OPEN
    msg_close = conf.get(CONF_MSG_CLOSE) or DEFAULT_MSG_CLOSE
    msg_alert = conf.get(CONF_MSG_ALERT) or DEFAULT_MSG_ALERT
    alert_min = float(conf.get(CONF_ALERT_MINUTES, DEFAULT_ALERT_MINUTES) or 0)
    repeat_min = float(conf.get(CONF_REPEAT_MINUTES, DEFAULT_REPEAT_MINUTES) or 0)
    debounce = float(conf.get(CONF_DEBOUNCE, DEFAULT_DEBOUNCE) or 0)

    data["sensor"] = sensor_id
    data["alert_minutes"] = alert_min
    data["ready"] = False  # chưa đồng bộ trạng thái đầu -> chưa xử lý sự kiện

    def _read_open(raw) -> bool | None:
        """Trạng thái logic của cửa: True = mở, False = đóng, None = không đọc được."""
        state = str(raw).lower() if raw is not None else ""
        if state in STATE_CLOSED:
            is_open = False
        elif state in STATE_OPEN:
            is_open = True
        else:
            return None  # unknown / unavailable -> giữ nguyên trạng thái cũ
        return not is_open if invert else is_open

    def _render(template: str, when: datetime, seconds: float | None) -> str:
        local = dt_util.as_local(when)
        return (
            template.replace("{time}", local.strftime("%H:%M"))
            .replace("{date}", local.strftime("%d/%m/%Y"))
            .replace("{duration}", fmt_duration(seconds))
        )

    async def _notify(message: str) -> None:
        if not notify_service:
            return
        svc = notify_service.split(".")[-1]  # 'notify.mobile_app_x' -> 'mobile_app_x'
        try:
            await hass.services.async_call(
                "notify",
                svc,
                {
                    "title": NOTIFY_TITLE,
                    "message": message,
                    "data": {
                        # Android + iOS: bấm thông báo -> mở panel "Cửa cuốn"
                        "clickAction": f"/{PANEL_PATH}",
                        "url": f"/{PANEL_PATH}",
                        "tag": NOTIFY_TAG,
                    },
                },
                blocking=False,
            )
        except Exception as err:  # noqa: BLE001
            _LOGGER.warning("Cửa cuốn: gửi thông báo lỗi: %s", err)

    # ---------- hẹn giờ cảnh báo "mở quá lâu" ----------

    @callback
    def _cancel_alert() -> None:
        cancel = data.pop("alert_cancel", None)
        if cancel:
            cancel()

    @callback
    def _arm_alert() -> None:
        """Đặt lịch cảnh báo đầu tiên cho lượt mở đang diễn ra."""
        _cancel_alert()
        if alert_min <= 0 or not data.get("open"):
            return
        now = dt_util.utcnow()
        when = (data.get("open_at") or now) + timedelta(minutes=alert_min)
        # Mở từ trước khi HA khởi động lại và đã quá hạn -> báo ngay sau 10s
        data["alert_cancel"] = async_track_point_in_time(
            hass, _alert_fire, max(when, now + timedelta(seconds=10))
        )

    @callback
    def _alert_fire(_now: datetime) -> None:
        data.pop("alert_cancel", None)
        hass.async_create_task(_do_alert())

    async def _do_alert() -> None:
        if not data.get("open"):
            return
        now = dt_util.utcnow()
        opened_at = data.get("open_at")
        seconds = (now - opened_at).total_seconds() if opened_at else None
        await _notify(_render(msg_alert, now, seconds))

        sessions = data["log"].setdefault("sessions", [])
        if sessions and not sessions[0].get("close"):
            sessions[0]["alerts"] = int(sessions[0].get("alerts", 0)) + 1
            await store.async_save(data["log"])
        _LOGGER.info("Cửa cuốn: cảnh báo mở quá lâu (%s)", fmt_duration(seconds))

        if repeat_min > 0:
            data["alert_cancel"] = async_track_point_in_time(
                hass, _alert_fire, now + timedelta(minutes=repeat_min)
            )

    # ---------- ghi nhận đóng/mở ----------

    async def _apply(is_open: bool, when: datetime, notify: bool = True) -> None:
        """Chốt 1 lần chuyển trạng thái: cập nhật nhật ký, thông báo, hẹn cảnh báo."""
        data["open"] = is_open
        data.pop("manual_ack", None)  # có chuyển trạng thái thật -> bỏ ghi nhớ chốt tay
        sessions = data["log"].setdefault("sessions", [])

        if is_open:
            data["open_at"] = when
            sessions.insert(0, {"open": when.isoformat()})
            del sessions[MAX_LOG:]
            _arm_alert()
            _LOGGER.info("Cửa cuốn: MỞ lúc %s", when.isoformat())
            if notify:
                await _notify(_render(msg_open, when, None))
        else:
            _cancel_alert()
            seconds = None
            if sessions and not sessions[0].get("close"):
                started = dt_util.parse_datetime(sessions[0].get("open", ""))
                if started:
                    seconds = max(0.0, (when - started).total_seconds())
                sessions[0]["close"] = when.isoformat()
                sessions[0]["dur"] = round(seconds) if seconds is not None else None
            else:
                # Không có lượt mở nào đang treo (tín hiệu MỞ bị lọt) -> vẫn ghi 1 lượt
                # thiếu điểm đầu, để nhìn thấy trên nhật ký và vuốt trái chốt tay được.
                sessions.insert(0, {"close": when.isoformat()})
                del sessions[MAX_LOG:]
            data["open_at"] = None
            _LOGGER.info("Cửa cuốn: ĐÓNG lúc %s (mở %s)", when.isoformat(), fmt_duration(seconds))
            if notify:
                await _notify(_render(msg_close, when, seconds))

        await store.async_save(data["log"])

    async def _commit(is_open: bool) -> None:
        """Xác nhận lại trạng thái sau khi hết thời gian chống rung rồi mới ghi nhận."""
        state = hass.states.get(sensor_id) if sensor_id else None
        current = _read_open(state.state) if state else None
        if current is not None and current != is_open:
            return  # cửa đã đổi lại trong lúc chờ -> bỏ qua
        if is_open == data.get("open"):
            return
        await _apply(is_open, dt_util.utcnow(), notify=True)

    @callback
    def _fire_debounce(_now: datetime) -> None:
        data.pop("debounce_cancel", None)
        pending = data.pop("debounce_val", None)
        if pending is not None:
            hass.async_create_task(_commit(pending))

    @callback
    def _on_state(event: Event) -> None:
        if not data.get("ready"):
            return  # chưa đồng bộ xong -> tránh báo nhầm lúc HA đang khởi động
        new_state = event.data.get("new_state")
        if new_state is None:
            return
        value = _read_open(new_state.state)
        if value is None:
            return  # unavailable/unknown -> không coi là đóng

        cancel = data.pop("debounce_cancel", None)
        if cancel:
            cancel()
        data.pop("debounce_val", None)

        if value == data.get("open"):
            return  # nhảy đi rồi về như cũ trong lúc chống rung -> bỏ qua

        if debounce <= 0:
            hass.async_create_task(_commit(value))
            return
        data["debounce_val"] = value
        data["debounce_cancel"] = async_call_later(hass, debounce, _fire_debounce)

    async def _sync_initial() -> None:
        """Đồng bộ trạng thái lúc khởi động (không gửi thông báo).

        Dùng `last_changed` của cảm biến để vá lượt mở/đóng đã xảy ra khi HA đang tắt.
        """
        state = hass.states.get(sensor_id) if sensor_id else None
        current = _read_open(state.state) if state else None
        sessions = data["log"].setdefault("sessions", [])
        pending = sessions[0] if sessions and not sessions[0].get("close") else None

        if current is None:
            data["open"] = pending is not None
            data["open_at"] = dt_util.parse_datetime(pending["open"]) if pending else None
        elif current and pending is None:
            await _apply(True, state.last_changed or dt_util.utcnow(), notify=False)
        elif not current and pending is not None:
            await _apply(False, state.last_changed or dt_util.utcnow(), notify=False)
        else:
            data["open"] = current
            data["open_at"] = dt_util.parse_datetime(pending["open"]) if pending else None

        _arm_alert()
        data["ready"] = True
        _LOGGER.debug("Cửa cuốn: đồng bộ trạng thái đầu -> %s", "MỞ" if data["open"] else "ĐÓNG")

    @callback
    def _poll(_now: datetime) -> None:
        """Lưới an toàn: đối chiếu định kỳ, vá lại nếu sự kiện state_changed bị lọt."""
        if not data.get("ready") or not sensor_id:
            return
        if data.get("debounce_cancel"):
            return  # đang trong thời gian chống rung -> để nó xử lý
        state = hass.states.get(sensor_id)
        if state is None:
            return
        ack = data.get("manual_ack")
        if ack is not None and state.last_changed == ack:
            return  # người dùng đã chốt tay lượt này; cảm biến vẫn kẹt ở trạng thái cũ -> đừng mở lại
        value = _read_open(state.state)
        if value is None or value == data.get("open"):
            return
        changed = state.last_changed or dt_util.utcnow()
        if (dt_util.utcnow() - changed).total_seconds() < max(debounce, 5):
            return  # vừa mới đổi -> nhường cho luồng sự kiện thường
        _LOGGER.warning(
            "Cửa cuốn: lệch trạng thái (sự kiện bị lọt) — cảm biến '%s' đang '%s' từ %s, "
            "tích hợp đang giữ '%s'. Vá lại nhật ký.",
            sensor_id,
            state.state,
            changed.isoformat(),
            "MỞ" if data.get("open") else "ĐÓNG",
        )
        data["patched"] = int(data.get("patched", 0)) + 1
        hass.async_create_task(_apply(value, changed, notify=True))

    if sensor_id:
        entry.async_on_unload(
            async_track_state_change_event(hass, [sensor_id], _on_state)
        )
        entry.async_on_unload(async_track_time_interval(hass, _poll, POLL_INTERVAL))

    if hass.is_running:
        await _sync_initial()
    else:
        entry.async_on_unload(
            hass.bus.async_listen_once(
                EVENT_HOMEASSISTANT_STARTED,
                lambda _e: hass.async_create_task(_sync_initial()),
            )
        )

    @callback
    def _cleanup() -> None:
        _cancel_alert()
        cancel = data.pop("debounce_cancel", None)
        if cancel:
            cancel()
        data.pop("debounce_val", None)

    entry.async_on_unload(_cleanup)

    # Sửa tùy chọn (Configure) -> nạp lại entry để áp dụng ngay
    entry.async_on_unload(entry.add_update_listener(_async_update_listener))

    _LOGGER.info(
        "Cửa cuốn: theo dõi '%s' (đảo=%s), thông báo qua '%s', cảnh báo mở quá %s phút",
        sensor_id,
        invert,
        notify_service,
        alert_min or "tắt",
    )
    return True


async def _async_update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


@websocket_api.websocket_command({vol.Required("type"): "cua_cuon/get_log"})
@websocket_api.async_response
async def ws_get_log(hass: HomeAssistant, connection, msg) -> None:
    data = hass.data.get(DOMAIN, {})
    opened_at = data.get("open_at")
    sensor_id = data.get("sensor")
    state = hass.states.get(sensor_id) if sensor_id else None
    connection.send_result(
        msg["id"],
        {
            "sessions": data.get("log", {}).get("sessions", []),
            "open": bool(data.get("open")),
            "open_at": opened_at.isoformat() if opened_at else None,
            "sensor": sensor_id,
            "alert_minutes": data.get("alert_minutes"),
            # "sức khỏe" cảm biến: cho biết HA CÓ đang nhận tin từ cảm biến hay không
            "sensor_state": state.state if state else None,
            "sensor_changed": state.last_changed.isoformat() if state else None,
            "sensor_updated": state.last_updated.isoformat() if state else None,
            "patched": int(data.get("patched", 0)),
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "cua_cuon/finish",
        vol.Required("key"): str,  # mốc 'open' (hoặc 'close' nếu lượt thiếu điểm đầu)
    }
)
@websocket_api.async_response
async def ws_finish(hass: HomeAssistant, connection, msg) -> None:
    """Chốt tay 1 lượt bị hở vì cảm biến lọt tín hiệu (mất wifi, lag...).

    Thiếu điểm cuối -> đóng lại tại `mở + 60s`; thiếu điểm đầu -> mở tại `đóng - 60s`.
    Nếu đó là lượt đang treo thì coi như cửa đã đóng: tắt cảnh báo lặp và đưa panel về ĐÃ ĐÓNG.
    """
    data = hass.data.get(DOMAIN, {})
    log = data.get("log", {"sessions": []})
    key = msg["key"]

    target = next(
        (s for s in log.get("sessions", []) if key in (s.get("open"), s.get("close"))),
        None,
    )
    if target is None:
        connection.send_result(msg["id"], {"ok": False, "reason": "not_found"})
        return

    gap = timedelta(seconds=MANUAL_GAP_SECONDS)
    was_pending = bool(target.get("open")) and not target.get("close")

    if was_pending:
        started = dt_util.parse_datetime(target["open"])
        if started is None:
            connection.send_result(msg["id"], {"ok": False, "reason": "bad_time"})
            return
        target["close"] = (started + gap).isoformat()
    elif target.get("close") and not target.get("open"):
        ended = dt_util.parse_datetime(target["close"])
        if ended is None:
            connection.send_result(msg["id"], {"ok": False, "reason": "bad_time"})
            return
        target["open"] = (ended - gap).isoformat()
    else:
        connection.send_result(msg["id"], {"ok": False, "reason": "complete"})
        return

    target["dur"] = MANUAL_GAP_SECONDS
    target["manual"] = True   # đánh dấu: thời lượng này là ước lượng, không phải đo thật
    target.pop("alerts", None)

    # Lượt đang treo -> coi như cửa đã đóng
    if was_pending and data.get("open"):
        data["open"] = False
        data["open_at"] = None
        cancel = data.pop("alert_cancel", None)
        if cancel:
            cancel()
        sensor_id = data.get("sensor")
        state = hass.states.get(sensor_id) if sensor_id else None
        # Ghi nhớ mốc trạng thái đang kẹt -> lưới an toàn 60s không mở lại lượt vừa chốt
        data["manual_ack"] = state.last_changed if state else None
        _LOGGER.info("Cửa cuốn: chốt tay lượt đang treo (%s) -> coi như ĐÃ ĐÓNG", key)

    store: Store = data.get("store")
    if store:
        await store.async_save(log)
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command({vol.Required("type"): "cua_cuon/clear_log"})
@websocket_api.async_response
async def ws_clear_log(hass: HomeAssistant, connection, msg) -> None:
    """Xóa nhật ký. Nếu cửa đang mở thì giữ lại lượt mở hiện tại để vẫn tính được thời lượng."""
    data = hass.data.get(DOMAIN, {})
    keep = []
    if data.get("open") and data.get("open_at"):
        keep = [{"open": data["open_at"].isoformat()}]
    data["log"] = {"sessions": keep}
    store: Store = data.get("store")
    if store:
        await store.async_save(data["log"])
    connection.send_result(msg["id"], {"ok": True})


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    if PANEL_PATH in hass.data.get(frontend.DATA_PANELS, {}):
        frontend.async_remove_panel(hass, PANEL_PATH)
    return True
