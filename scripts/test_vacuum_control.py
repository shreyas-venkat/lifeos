"""Tests for vacuum-control.py."""

import importlib
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

_spec = importlib.util.spec_from_file_location(
    "vacuum_control", Path(__file__).parent / "vacuum-control.py"
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

VacuumController = _mod.VacuumController
should_auto_clean = _mod.should_auto_clean
get_tuya_device = _mod.get_tuya_device


# --- get_tuya_device ---


class TestGetTuyaDevice:
    def _mock_tinytuya(self):
        """Create a mock tinytuya module to avoid import errors."""
        mock_module = MagicMock()
        return patch.dict("sys.modules", {"tinytuya": mock_module})

    def test_missing_device_id_raises(self):
        with self._mock_tinytuya(), patch.dict("os.environ", {}, clear=True):
            with pytest.raises(ValueError, match="TUYA_DEVICE_ID"):
                get_tuya_device()

    def test_missing_local_key_raises(self):
        with self._mock_tinytuya(), patch.dict("os.environ", {"TUYA_DEVICE_ID": "abc"}, clear=True):
            with pytest.raises(ValueError, match="TUYA_LOCAL_KEY"):
                get_tuya_device()


# --- VacuumController ---


class TestVacuumController:
    @pytest.fixture()
    def controller(self):
        ctrl = VacuumController()
        ctrl._device = MagicMock()
        return ctrl

    def test_start_clean(self, controller):
        result = controller.start_clean()
        assert result == {"status": "cleaning", "mode": "smart"}
        calls = controller.device.set_value.call_args_list
        assert calls[0].args == (1, True)
        assert calls[1].args == (5, "smart")

    def test_stop_clean(self, controller):
        result = controller.stop_clean()
        assert result == {"status": "stopped"}
        controller.device.set_value.assert_called_once_with(1, False)

    def test_return_home(self, controller):
        result = controller.return_home()
        assert result == {"status": "returning_home"}
        controller.device.set_value.assert_called_once_with(101, True)

    def test_get_status(self, controller):
        controller.device.status.return_value = {
            "dps": {"1": True, "5": "smart", "104": 85},
        }
        result = controller.get_status()
        assert result["power"] is True
        assert result["mode"] == "smart"
        assert result["battery"] == 85

    def test_get_status_empty_dps(self, controller):
        controller.device.status.return_value = {}
        result = controller.get_status()
        assert result["power"] is False
        assert result["mode"] == "unknown"
        assert result["battery"] == 0


# --- should_auto_clean ---


class TestShouldAutoClean:
    def test_monday_no_clean(self):
        assert should_auto_clean(0) is False

    def test_tuesday_clean(self):
        assert should_auto_clean(1) is True

    def test_wednesday_no_clean(self):
        assert should_auto_clean(2) is False

    def test_thursday_clean(self):
        assert should_auto_clean(3) is True

    def test_friday_clean(self):
        assert should_auto_clean(4) is True

    def test_saturday_no_clean(self):
        assert should_auto_clean(5) is False

    def test_sunday_no_clean(self):
        assert should_auto_clean(6) is False
