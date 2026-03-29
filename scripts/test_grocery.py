"""Tests for grocery/coop-cart.py."""

import importlib
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

_spec = importlib.util.spec_from_file_location(
    "coop_cart", Path(__file__).parent / "grocery" / "coop-cart.py"
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

CoopCartAutomation = _mod.CoopCartAutomation


class TestCoopCartInit:
    def test_base_url(self):
        cart = CoopCartAutomation()
        assert cart.base_url == "https://shoponline.calgarycoop.com"

    def test_browser_initially_none(self):
        cart = CoopCartAutomation()
        assert cart._browser is None
        assert cart._page is None


class TestLogin:
    @pytest.mark.asyncio
    async def test_login_missing_credentials(self):
        cart = CoopCartAutomation()
        with patch.dict("os.environ", {}, clear=True):
            with pytest.raises(ValueError, match="COOP_EMAIL"):
                await cart.login()

    @pytest.mark.asyncio
    async def test_login_success(self):
        cart = CoopCartAutomation()
        mock_page = AsyncMock()
        cart._page = mock_page

        with patch.dict("os.environ", {"COOP_EMAIL": "test@test.com", "COOP_PASSWORD": "pass123"}):
            result = await cart.login()

        assert result == {"status": "logged_in"}
        mock_page.goto.assert_called_once()
        mock_page.fill.assert_any_call('input[name="email"]', "test@test.com")
        mock_page.fill.assert_any_call('input[name="password"]', "pass123")
        mock_page.click.assert_called_once_with('button[type="submit"]')


class TestSearchAndAdd:
    @pytest.mark.asyncio
    async def test_item_not_found(self):
        cart = CoopCartAutomation()
        mock_page = AsyncMock()

        # locator() is synchronous in Playwright, so use MagicMock
        mock_product = AsyncMock()
        mock_product.is_visible.return_value = False
        mock_page.locator = MagicMock(return_value=MagicMock(first=mock_product))

        cart._page = mock_page

        result = await cart.search_and_add("nonexistent item")
        assert result["status"] == "not_found"
        assert result["query"] == "nonexistent item"

    @pytest.mark.asyncio
    async def test_item_found_and_added(self):
        cart = CoopCartAutomation()
        mock_page = AsyncMock()

        # Build the mock chain: page.locator('.product-card').first
        mock_product = AsyncMock()
        mock_product.is_visible.return_value = True

        mock_name_locator = AsyncMock()
        mock_name_locator.text_content.return_value = "Chicken Breast 1kg"

        mock_price_locator = AsyncMock()
        mock_price_locator.text_content.return_value = "$12.99"

        mock_add_button = AsyncMock()

        def product_locator_side_effect(selector):
            if "product-name" in selector:
                return mock_name_locator
            elif "product-price" in selector:
                return mock_price_locator
            elif "Add" in selector:
                return mock_add_button
            return AsyncMock()

        # locator() on the product is synchronous too
        mock_product.locator = MagicMock(side_effect=product_locator_side_effect)

        # page.locator() is synchronous; .first is a property
        mock_page.locator = MagicMock(return_value=MagicMock(first=mock_product))

        cart._page = mock_page

        result = await cart.search_and_add("chicken breast", quantity=2)
        assert result["status"] == "added"
        assert result["product"] == "Chicken Breast 1kg"
        assert result["price"] == "$12.99"
        assert result["quantity"] == 2


class TestBuildCart:
    @pytest.mark.asyncio
    async def test_build_cart_mixed_results(self):
        cart = CoopCartAutomation()

        async def mock_search(item, qty=1):
            if item == "milk":
                return {"status": "added", "query": "milk", "product": "Milk 2L", "quantity": qty}
            return {"status": "not_found", "query": item}

        cart.search_and_add = mock_search

        items = [
            {"name": "milk", "quantity": 1},
            {"name": "unicorn steak", "quantity": 1},
        ]
        result = await cart.build_cart(items)

        assert result["total_added"] == 1
        assert result["total_not_found"] == 1
        assert len(result["added"]) == 1
        assert len(result["not_found"]) == 1
        assert result["added"][0]["product"] == "Milk 2L"

    @pytest.mark.asyncio
    async def test_build_cart_all_found(self):
        cart = CoopCartAutomation()

        async def mock_search(item, qty=1):
            return {"status": "added", "query": item, "product": item, "quantity": qty}

        cart.search_and_add = mock_search

        items = [{"name": "eggs"}, {"name": "bread"}]
        result = await cart.build_cart(items)
        assert result["total_added"] == 2
        assert result["total_not_found"] == 0

    @pytest.mark.asyncio
    async def test_build_cart_empty_list(self):
        cart = CoopCartAutomation()
        result = await cart.build_cart([])
        assert result["total_added"] == 0
        assert result["total_not_found"] == 0


class TestCartUrl:
    @pytest.mark.asyncio
    async def test_get_cart_url(self):
        cart = CoopCartAutomation()
        url = await cart.get_cart_url()
        assert url == "https://shoponline.calgarycoop.com/cart"


class TestClose:
    @pytest.mark.asyncio
    async def test_close_with_browser(self):
        cart = CoopCartAutomation()
        cart._browser = AsyncMock()
        cart._page = AsyncMock()
        await cart.close()
        assert cart._browser is None
        assert cart._page is None

    @pytest.mark.asyncio
    async def test_close_without_browser(self):
        cart = CoopCartAutomation()
        await cart.close()  # should not raise
