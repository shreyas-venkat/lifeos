"""Tests for bill-tracker.py."""

import importlib
from datetime import date
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "bill_tracker", Path(__file__).parent / "bill-tracker.py"
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

BillParser = _mod.BillParser


# --- parse_amount ---


class TestParseAmount:
    def test_dollar_sign(self):
        assert BillParser.parse_amount("Your bill is $100.50") == 100.50

    def test_dollar_with_commas(self):
        assert BillParser.parse_amount("Total: $1,234.56") == 1234.56

    def test_cad_prefix(self):
        assert BillParser.parse_amount("CAD 50.00 charged") == 50.00

    def test_amount_keyword(self):
        assert BillParser.parse_amount("Amount: 75.25") == 75.25

    def test_no_amount(self):
        assert BillParser.parse_amount("No amount here") is None

    def test_whole_dollar(self):
        assert BillParser.parse_amount("You owe $200") == 200.0


# --- parse_merchant ---


class TestParseMerchant:
    def test_payment_to(self):
        result = BillParser.parse_merchant("Payment to Netflix for subscription")
        assert result == "Netflix"

    def test_at_merchant(self):
        result = BillParser.parse_merchant("Purchase at Walmart on March 1")
        assert result == "Walmart"

    def test_from_merchant(self):
        result = BillParser.parse_merchant("Charge from Shaw Communications for March")
        assert result == "Shaw Communications"

    def test_no_merchant(self):
        assert BillParser.parse_merchant("Random text with no pattern") is None


# --- parse_due_date ---


class TestParseDueDate:
    def test_due_on_long_format(self):
        result = BillParser.parse_due_date("Payment due on March 15, 2025")
        assert result == date(2025, 3, 15)

    def test_iso_format(self):
        result = BillParser.parse_due_date("Due date: 2025-04-01")
        assert result == date(2025, 4, 1)

    def test_slash_format(self):
        result = BillParser.parse_due_date("Pay by 3/15/2025")
        assert result == date(2025, 3, 15)

    def test_due_without_on(self):
        result = BillParser.parse_due_date("Payment due January 5, 2025")
        assert result == date(2025, 1, 5)

    def test_no_date(self):
        assert BillParser.parse_due_date("No date information") is None


# --- detect_recurring ---


class TestDetectRecurring:
    def test_monthly(self):
        assert BillParser.detect_recurring("Monthly billing cycle") == "monthly"

    def test_weekly(self):
        assert BillParser.detect_recurring("Weekly charge") == "weekly"

    def test_annual(self):
        assert BillParser.detect_recurring("Annual subscription renewal") == "annually"

    def test_yearly(self):
        assert BillParser.detect_recurring("Yearly plan") == "annually"

    def test_quarterly(self):
        assert BillParser.detect_recurring("Quarterly fee") == "quarterly"

    def test_subscription(self):
        assert BillParser.detect_recurring("Subscription payment") == "monthly"

    def test_bi_weekly(self):
        assert BillParser.detect_recurring("Bi-weekly payment") == "bi-weekly"

    def test_not_recurring(self):
        assert BillParser.detect_recurring("One-time purchase") is None

    def test_case_insensitive(self):
        assert BillParser.detect_recurring("MONTHLY BILL") == "monthly"


# --- parse_email (end-to-end) ---


class TestParseEmail:
    def test_rbc_notification(self):
        subject = "RBC: Payment of $156.78 to Shaw Communications"
        body = (
            "Your pre-authorized payment of $156.78 to Shaw Communications "
            "has been processed. This is a monthly recurring payment. "
            "Next payment due on April 15, 2025."
        )
        result = BillParser.parse_email(subject, body, "notify@rbc.com")

        assert result["amount"] == 156.78
        assert result["merchant"] == "Shaw Communications"
        assert result["due_date"] == date(2025, 4, 15)
        assert result["recurring"] == "monthly"
        assert result["status"] == "upcoming"
        assert result["id"]  # UUID generated
        assert result["name"] == subject

    def test_simple_bill(self):
        subject = "Payment confirmation"
        body = "Amount: 45.99 charged at Best Buy on 2025-06-01"
        result = BillParser.parse_email(subject, body)

        assert result["amount"] == 45.99
        assert result["merchant"] == "Best Buy"
        assert result["due_date"] == date(2025, 6, 1)

    def test_minimal_email(self):
        result = BillParser.parse_email("Hello", "No bill info here")
        assert result["amount"] is None
        assert result["merchant"] is None
        assert result["due_date"] is None
        assert result["recurring"] is None
        assert result["status"] == "upcoming"

    def test_name_truncated_at_100(self):
        long_subject = "A" * 200
        result = BillParser.parse_email(long_subject, "")
        assert len(result["name"]) == 100
