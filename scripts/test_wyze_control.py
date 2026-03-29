"""Tests for wyze-control.py."""

import importlib
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Import the module from hyphenated filename
_spec = importlib.util.spec_from_file_location(
    "wyze_control", Path(__file__).parent / "wyze-control.py"
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

WyzeLampController = _mod.WyzeLampController
determine_alarm_gentleness = _mod.determine_alarm_gentleness
get_wyze_client = _mod.get_wyze_client


# --- get_wyze_client ---


class TestGetWyzeClient:
    def _mock_wyze_sdk(self):
        """Create a mock wyze_sdk module to avoid import errors."""
        mock_module = MagicMock()
        return patch.dict("sys.modules", {"wyze_sdk": mock_module})

    def test_missing_email_raises(self):
        with self._mock_wyze_sdk(), patch.dict("os.environ", {}, clear=True):
            with pytest.raises(ValueError, match="WYZE_EMAIL"):
                get_wyze_client()

    def test_missing_password_raises(self):
        with self._mock_wyze_sdk(), patch.dict("os.environ", {"WYZE_EMAIL": "a@b.com"}, clear=True):
            with pytest.raises(ValueError, match="WYZE_PASSWORD"):
                get_wyze_client()


# --- WyzeLampController ---


class TestWyzeLampController:
    @pytest.fixture()
    def controller(self):
        ctrl = WyzeLampController(device_mac="AABBCCDD")
        ctrl._client = MagicMock()
        return ctrl

    def test_turn_on(self, controller):
        result = controller.turn_on()
        assert result == {"status": "on", "device": "AABBCCDD"}
        controller.client.bulbs.turn_on.assert_called_once_with(
            device_mac="AABBCCDD", device_model="WLPA19"
        )

    def test_turn_off(self, controller):
        result = controller.turn_off()
        assert result == {"status": "off", "device": "AABBCCDD"}
        controller.client.bulbs.turn_off.assert_called_once()

    def test_brightness_clamp_low(self, controller):
        result = controller.set_brightness(-10)
        assert result["brightness"] == 0

    def test_brightness_clamp_high(self, controller):
        result = controller.set_brightness(200)
        assert result["brightness"] == 100

    def test_brightness_normal(self, controller):
        result = controller.set_brightness(50)
        assert result["brightness"] == 50
        controller.client.bulbs.set_brightness.assert_called_once_with(
            device_mac="AABBCCDD", device_model="WLPA19", brightness=50
        )

    def test_color_temp_clamp_low(self, controller):
        result = controller.set_color_temp(1000)
        assert result["color_temp"] == 2700

    def test_color_temp_clamp_high(self, controller):
        result = controller.set_color_temp(9000)
        assert result["color_temp"] == 6500

    def test_color_temp_normal(self, controller):
        result = controller.set_color_temp(4000)
        assert result["color_temp"] == 4000

    def test_device_mac_from_env(self):
        with patch.dict("os.environ", {"WYZE_LAMP_MAC": "ENV_MAC"}):
            ctrl = WyzeLampController()
            assert ctrl.device_mac == "ENV_MAC"


# --- sunrise_ramp ---


class TestSunriseRamp:
    @pytest.fixture()
    def controller(self):
        ctrl = WyzeLampController(device_mac="AABBCCDD")
        ctrl._client = MagicMock()
        return ctrl

    @pytest.mark.asyncio
    async def test_sunrise_ramp_default(self, controller):
        with patch("asyncio.sleep", return_value=None):
            result = await controller.sunrise_ramp(duration_minutes=30, gentle=False)
        assert result["status"] == "complete"
        assert result["duration_minutes"] == 30
        assert result["gentle"] is False
        assert result["final_brightness"] == 100
        assert result["final_color_temp"] == 5000

    @pytest.mark.asyncio
    async def test_sunrise_ramp_gentle(self, controller):
        with patch("asyncio.sleep", return_value=None):
            result = await controller.sunrise_ramp(duration_minutes=30, gentle=True)
        assert result["duration_minutes"] == 45  # 30 * 1.5
        assert result["gentle"] is True

    @pytest.mark.asyncio
    async def test_sunrise_ramp_calls_brightness_steps(self, controller):
        with patch("asyncio.sleep", return_value=None):
            await controller.sunrise_ramp(duration_minutes=10)
        # 1 initial + 10 step calls = 11
        assert controller.client.bulbs.set_brightness.call_count == 11


# --- determine_alarm_gentleness ---


class TestDetermineAlarmGentleness:
    def test_poor_quality_is_gentle(self):
        assert determine_alarm_gentleness({"sleep_quality": 30, "sleep_duration": 8}) is True

    def test_short_sleep_is_gentle(self):
        assert determine_alarm_gentleness({"sleep_quality": 80, "sleep_duration": 4}) is True

    def test_good_sleep_not_gentle(self):
        assert determine_alarm_gentleness({"sleep_quality": 80, "sleep_duration": 8}) is False

    def test_boundary_quality_40_not_gentle(self):
        assert determine_alarm_gentleness({"sleep_quality": 40, "sleep_duration": 7}) is False

    def test_boundary_duration_5_5_not_gentle(self):
        assert determine_alarm_gentleness({"sleep_quality": 50, "sleep_duration": 5.5}) is False

    def test_defaults_when_empty(self):
        # Default quality=50, duration=7 -> not gentle
        assert determine_alarm_gentleness({}) is False
