"""Lefant M210 vacuum control via Tuya Cloud API.

Controls the robot vacuum for scheduled cleaning when
user is at the office.
"""

import json
import os


def get_tuya_device():
    """Get TinyTuya device connection."""
    import tinytuya

    device_id = os.environ.get("TUYA_DEVICE_ID")
    local_key = os.environ.get("TUYA_LOCAL_KEY")
    ip_address = os.environ.get("TUYA_DEVICE_IP")

    if not device_id or not local_key:
        raise ValueError("TUYA_DEVICE_ID and TUYA_LOCAL_KEY environment variables required")

    return tinytuya.Device(device_id, ip_address or "Auto", local_key)


class VacuumController:
    """Controls Lefant M210 robot vacuum via Tuya."""

    def __init__(self):
        self._device = None

    @property
    def device(self):
        if not self._device:
            self._device = get_tuya_device()
        return self._device

    def start_clean(self) -> dict:
        """Start cleaning cycle."""
        self.device.set_value(1, True)  # Power on
        self.device.set_value(5, "smart")  # Auto/smart mode
        return {"status": "cleaning", "mode": "smart"}

    def stop_clean(self) -> dict:
        """Stop cleaning and stay in place."""
        self.device.set_value(1, False)
        return {"status": "stopped"}

    def return_home(self) -> dict:
        """Return to charging dock."""
        self.device.set_value(101, True)  # Return home command
        return {"status": "returning_home"}

    def get_status(self) -> dict:
        """Get current vacuum status."""
        data = self.device.status()
        return {
            "power": data.get("dps", {}).get("1", False),
            "mode": data.get("dps", {}).get("5", "unknown"),
            "battery": data.get("dps", {}).get("104", 0),
            "raw": data,
        }


def should_auto_clean(day_of_week: int) -> bool:
    """Check if today is an office day (Tue=1, Thu=3, Fri=4).

    Args:
        day_of_week: 0=Monday, 6=Sunday
    """
    office_days = {1, 3, 4}  # Tuesday, Thursday, Friday
    return day_of_week in office_days


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Vacuum control")
    parser.add_argument("action", choices=["start", "stop", "home", "status"])
    args = parser.parse_args()

    controller = VacuumController()

    actions = {
        "start": controller.start_clean,
        "stop": controller.stop_clean,
        "home": controller.return_home,
        "status": controller.get_status,
    }
    print(json.dumps(actions[args.action]()))
