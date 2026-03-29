"""Calgary Co-op online grocery cart automation.

Uses Playwright to add items to the Calgary Co-op
online shopping cart automatically.
"""

import asyncio
import json
import os


class CoopCartAutomation:
    """Automates adding items to Calgary Co-op online cart."""

    def __init__(self):
        self.base_url = "https://shoponline.calgarycoop.com"
        self._browser = None
        self._page = None

    async def _get_page(self):
        """Get or create a browser page."""
        if self._page:
            return self._page

        from playwright.async_api import async_playwright

        pw = await async_playwright().start()
        self._browser = await pw.chromium.launch(headless=True)
        self._page = await self._browser.new_page()
        return self._page

    async def login(self, email: str | None = None, password: str | None = None) -> dict:
        """Login to Calgary Co-op online."""
        email = email or os.environ.get("COOP_EMAIL")
        password = password or os.environ.get("COOP_PASSWORD")
        if not email or not password:
            raise ValueError("COOP_EMAIL and COOP_PASSWORD environment variables required")

        page = await self._get_page()
        await page.goto(f"{self.base_url}/login")
        await page.fill('input[name="email"]', email)
        await page.fill('input[name="password"]', password)
        await page.click('button[type="submit"]')
        await page.wait_for_load_state("networkidle")

        return {"status": "logged_in"}

    async def search_and_add(self, item: str, quantity: int = 1) -> dict:
        """Search for an item and add it to cart.

        Args:
            item: Search query (e.g., "chicken breast 1kg")
            quantity: Number to add

        Returns:
            Dict with status, item found, price
        """
        page = await self._get_page()
        await page.goto(f"{self.base_url}/search?q={item}")
        await page.wait_for_load_state("networkidle")

        # Find first product result
        product = page.locator(".product-card").first
        if not await product.is_visible():
            return {"status": "not_found", "query": item}

        product_name = await product.locator(".product-name").text_content()
        price_text = await product.locator(".product-price").text_content()

        # Add to cart
        add_button = product.locator('button:has-text("Add")')
        for _ in range(quantity):
            await add_button.click()
            await page.wait_for_timeout(500)

        return {
            "status": "added",
            "query": item,
            "product": product_name.strip() if product_name else item,
            "price": price_text.strip() if price_text else "unknown",
            "quantity": quantity,
        }

    async def build_cart(self, items: list[dict]) -> dict:
        """Build a complete cart from a grocery list.

        Args:
            items: List of dicts with 'name' and 'quantity' keys

        Returns:
            Summary with added/not_found items
        """
        results: dict = {"added": [], "not_found": []}

        for item in items:
            name = item.get("name", "")
            qty = item.get("quantity", 1)
            result = await self.search_and_add(name, qty)

            if result["status"] == "added":
                results["added"].append(result)
            else:
                results["not_found"].append(result)

        results["total_added"] = len(results["added"])
        results["total_not_found"] = len(results["not_found"])
        return results

    async def get_cart_url(self) -> str:
        """Get the current cart URL for user review."""
        return f"{self.base_url}/cart"

    async def close(self) -> None:
        """Close browser."""
        if self._browser:
            await self._browser.close()
            self._browser = None
            self._page = None


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Co-op cart automation")
    parser.add_argument("action", choices=["login", "add", "build", "cart-url"])
    parser.add_argument("--item", help="Item to search/add")
    parser.add_argument("--quantity", type=int, default=1)
    parser.add_argument("--items-json", help="JSON array of {name, quantity}")
    args = parser.parse_args()

    async def main():
        cart = CoopCartAutomation()
        try:
            if args.action == "login":
                result = await cart.login()
            elif args.action == "add":
                await cart.login()
                result = await cart.search_and_add(args.item, args.quantity)
            elif args.action == "build":
                await cart.login()
                items = json.loads(args.items_json)
                result = await cart.build_cart(items)
            elif args.action == "cart-url":
                result = {"url": await cart.get_cart_url()}
            print(json.dumps(result, indent=2))
        finally:
            await cart.close()

    asyncio.run(main())
