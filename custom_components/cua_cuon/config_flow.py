"""Config flow cho Cửa cuốn: chọn cảm biến cửa + kênh thông báo + ngưỡng cảnh báo."""
import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import selector

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
)


def _notify_options(hass) -> list[str]:
    """Danh sách dịch vụ notify hiện có (vd: notify.mobile_app_iphone)."""
    services = sorted((hass.services.async_services().get("notify") or {}).keys())
    return [f"notify.{s}" for s in services]


def _sensor_selector() -> selector.EntitySelector:
    """Cảm biến cửa: binary_sensor (contact) hoặc cover (mô tơ cửa cuốn)."""
    return selector.EntitySelector(
        selector.EntitySelectorConfig(domain=["binary_sensor", "cover"])
    )


def _notify_selector(hass) -> selector.SelectSelector:
    return selector.SelectSelector(
        selector.SelectSelectorConfig(
            options=_notify_options(hass),
            mode=selector.SelectSelectorMode.DROPDOWN,
            custom_value=True,
        )
    )


def _minutes_selector(maximum: int) -> selector.NumberSelector:
    return selector.NumberSelector(
        selector.NumberSelectorConfig(
            min=0, max=maximum, step=1, mode=selector.NumberSelectorMode.BOX,
            unit_of_measurement="phút",
        )
    )


class CuaCuonConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        if user_input is not None:
            return self.async_create_entry(title="Cửa cuốn", data=user_input)

        schema = vol.Schema(
            {
                vol.Required(CONF_SENSOR): _sensor_selector(),
                vol.Required(CONF_NOTIFY): _notify_selector(self.hass),
                vol.Optional(CONF_INVERT, default=False): selector.BooleanSelector(),
                vol.Optional(
                    CONF_ALERT_MINUTES, default=DEFAULT_ALERT_MINUTES
                ): _minutes_selector(1440),
            }
        )
        return self.async_show_form(step_id="user", data_schema=schema)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return CuaCuonOptionsFlow(config_entry)


class CuaCuonOptionsFlow(config_entries.OptionsFlow):
    """Sửa cảm biến, kênh thông báo, nội dung và các ngưỡng sau khi đã cài."""

    def __init__(self, config_entry) -> None:
        self._entry = config_entry

    async def async_step_init(self, user_input=None):
        if user_input is not None:
            cleaned = {k: v for k, v in user_input.items() if v not in (None, "")}
            return self.async_create_entry(title="", data=cleaned)

        cur = {**self._entry.data, **self._entry.options}
        schema = vol.Schema(
            {
                vol.Required(
                    CONF_SENSOR, default=cur.get(CONF_SENSOR, "")
                ): _sensor_selector(),
                vol.Required(
                    CONF_NOTIFY, default=cur.get(CONF_NOTIFY, "")
                ): _notify_selector(self.hass),
                vol.Optional(
                    CONF_INVERT, default=bool(cur.get(CONF_INVERT, False))
                ): selector.BooleanSelector(),
                vol.Optional(
                    CONF_ALERT_MINUTES,
                    default=float(cur.get(CONF_ALERT_MINUTES, DEFAULT_ALERT_MINUTES)),
                ): _minutes_selector(1440),
                vol.Optional(
                    CONF_REPEAT_MINUTES,
                    default=float(cur.get(CONF_REPEAT_MINUTES, DEFAULT_REPEAT_MINUTES)),
                ): _minutes_selector(1440),
                vol.Optional(
                    CONF_DEBOUNCE, default=float(cur.get(CONF_DEBOUNCE, DEFAULT_DEBOUNCE))
                ): selector.NumberSelector(
                    selector.NumberSelectorConfig(
                        min=0, max=120, step=1, mode=selector.NumberSelectorMode.BOX,
                        unit_of_measurement="giây",
                    )
                ),
                vol.Optional(
                    CONF_MSG_OPEN, default=cur.get(CONF_MSG_OPEN, DEFAULT_MSG_OPEN)
                ): selector.TextSelector(),
                vol.Optional(
                    CONF_MSG_CLOSE, default=cur.get(CONF_MSG_CLOSE, DEFAULT_MSG_CLOSE)
                ): selector.TextSelector(),
                vol.Optional(
                    CONF_MSG_ALERT, default=cur.get(CONF_MSG_ALERT, DEFAULT_MSG_ALERT)
                ): selector.TextSelector(),
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema)
