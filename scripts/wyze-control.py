"""Wyze lamp clock control for sleep-aware alarm.

Controls Wyze lamp brightness and color temperature for
sunrise simulation alarm based on sleep quality data.
"""

import asyncio
import json
import os


def get_wyze_client():
    """Get authenticated Wyze SDK client."""
    from wyze_sdk import Client

    email = os.environ.get("WYZE_EMAIL")
    password = os.environ.get("WYZE_PASSWORD")
    key_id = os.environ.get("WYZE_KEY_ID")
    api_key = os.environ.get("WYZE_API_KEY")
    if not email or not password:
        raise ValueError("WYZE_EMAIL and WYZE_PASSWORD environment variables required")
    return Client(email=email, password=password, key_id=key_id, api_key=api_key)


class WyzeLampController:
    """Controls a Wyze bulb for sleep-aware sunrise alarm."""

    def __init__(self, device_mac: str | None = None):
        self.device_mac = device_mac or os.environ.get("WYZE_LAMP_MAC")
        self._client = None

    @property
    def client(self):
        if not self._client:
            self._client = get_wyze_client()
        return self._client

    def turn_on(self) -> dict:
        """Turn the lamp on."""
        self.client.bulbs.turn_on(device_mac=self.device_mac, device_model="WLPA19")
        return {"status": "on", "device": self.device_mac}

    def turn_off(self) -> dict:
        """Turn the lamp off."""
        self.client.bulbs.turn_off(device_mac=self.device_mac, device_model="WLPA19")
        return {"status": "off", "device": self.device_mac}

    def set_brightness(self, level: int) -> dict:
        """Set brightness (0-100)."""
        level = max(0, min(100, level))
        self.client.bulbs.set_brightness(
            device_mac=self.device_mac, device_model="WLPA19", brightness=level
        )
        return {"brightness": level, "device": self.device_mac}

    def set_color_temp(self, temp: int) -> dict:
        """Set color temperature (2700K warm - 6500K cool)."""
        temp = max(2700, min(6500, temp))
        self.client.bulbs.set_color_temp(
            device_mac=self.device_mac, device_model="WLPA19", color_temp=temp
        )
        return {"color_temp": temp, "device": self.device_mac}

    async def sunrise_ramp(self, duration_minutes: int = 30, gentle: bool = False) -> dict:
        """Simulate sunrise with gradual brightness increase.

        Args:
            duration_minutes: How long the ramp takes (default 30)
            gentle: If True, slower ramp for restless nights
        """
        if gentle:
            duration_minutes = int(duration_minutes * 1.5)

        steps = 10
        interval = (duration_minutes * 60) / steps

        self.turn_on()
        self.set_color_temp(2700)  # Start warm
        self.set_brightness(1)

        for i in range(1, steps + 1):
            await asyncio.sleep(interval)
            brightness = int((i / steps) * 100)
            temp = 2700 + int((i / steps) * 2300)  # Ramp from 2700K to 5000K
            self.set_brightness(brightness)
            self.set_color_temp(temp)

        return {
            "status": "complete",
            "duration_minutes": duration_minutes,
            "gentle": gentle,
            "final_brightness": 100,
            "final_color_temp": 5000,
        }


def determine_alarm_gentleness(sleep_data: dict) -> bool:
    """Determine if alarm should be gentle based on sleep data.

    Args:
        sleep_data: Dict with 'sleep_quality' (0-100) and 'sleep_duration' (hours)
    """
    quality = sleep_data.get("sleep_quality", 50)
    duration = sleep_data.get("sleep_duration", 7)

    # Gentle if poor quality or short sleep
    return quality < 40 or duration < 5.5


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Wyze lamp control")
    parser.add_argument("action", choices=["on", "off", "brightness", "color_temp", "sunrise"])
    parser.add_argument("--value", type=int, help="Brightness (0-100) or color temp (2700-6500)")
    parser.add_argument("--gentle", action="store_true", help="Gentle sunrise ramp")
    parser.add_argument("--duration", type=int, default=30, help="Sunrise duration in minutes")
    args = parser.parse_args()

    controller = WyzeLampController()

    if args.action == "on":
        print(json.dumps(controller.turn_on()))
    elif args.action == "off":
        print(json.dumps(controller.turn_off()))
    elif args.action == "brightness":
        print(json.dumps(controller.set_brightness(args.value or 50)))
    elif args.action == "color_temp":
        print(json.dumps(controller.set_color_temp(args.value or 4000)))
    elif args.action == "sunrise":
        result = asyncio.run(controller.sunrise_ramp(args.duration, args.gentle))
        print(json.dumps(result))
