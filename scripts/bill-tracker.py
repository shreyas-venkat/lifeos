"""Bill tracking from bank email notifications.

Parses RBC bank email notifications to extract bill amounts,
merchants, and due dates.
"""

import json
import re
import uuid
from datetime import date, datetime


class BillParser:
    """Parses bank email content to extract bill information."""

    # Common patterns in RBC email notifications
    AMOUNT_PATTERNS = [
        r"\$[\d,]+\.?\d*",
        r"CAD\s*[\d,]+\.?\d*",
        r"Amount:\s*\$?([\d,]+\.?\d*)",
    ]

    MERCHANT_PATTERNS = [
        r"(?:to|from|at|merchant:?)\s+([A-Za-z0-9\s&\'-]+?)(?:\s+for|\s+on|\s+has|\s*$)",
        r"Payment\s+(?:\S+\s+)*?to\s+([A-Za-z0-9\s&\'-]+?)(?:\s+has|\s+for|\s+on|\s*$)",
    ]

    DATE_PATTERNS = [
        r"due\s+(?:on\s+)?(\w+\s+\d{1,2},?\s+\d{4})",
        r"(\d{4}-\d{2}-\d{2})",
        r"(\d{1,2}/\d{1,2}/\d{4})",
    ]

    @staticmethod
    def parse_amount(text: str) -> float | None:
        """Extract dollar amount from text."""
        for pattern in BillParser.AMOUNT_PATTERNS:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                amount_str = match.group(0) if not match.groups() else match.group(1)
                amount_str = amount_str.replace("$", "").replace("CAD", "").replace(",", "").strip()
                try:
                    return float(amount_str)
                except ValueError:
                    continue
        return None

    @staticmethod
    def parse_merchant(text: str) -> str | None:
        """Extract merchant name from text."""
        for pattern in BillParser.MERCHANT_PATTERNS:
            match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
            if match:
                return match.group(1).strip()
        return None

    @staticmethod
    def parse_due_date(text: str) -> date | None:
        """Extract due date from text."""
        for pattern in BillParser.DATE_PATTERNS:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                date_str = match.group(1)
                for fmt in ["%B %d, %Y", "%B %d %Y", "%Y-%m-%d", "%m/%d/%Y"]:
                    try:
                        return datetime.strptime(date_str, fmt).date()
                    except ValueError:
                        continue
        return None

    @staticmethod
    def detect_recurring(text: str) -> str | None:
        """Detect if this is a recurring bill."""
        recurring_keywords = {
            "bi-weekly": "bi-weekly",
            "monthly": "monthly",
            "weekly": "weekly",
            "annual": "annually",
            "yearly": "annually",
            "quarterly": "quarterly",
            "recurring": "monthly",  # assume monthly if just "recurring"
            "subscription": "monthly",
        }
        text_lower = text.lower()
        for keyword, frequency in recurring_keywords.items():
            if keyword in text_lower:
                return frequency
        return None

    @classmethod
    def parse_email(cls, subject: str, body: str, sender: str = "") -> dict:
        """Parse a bank email to extract bill information.

        Args:
            subject: Email subject line
            body: Email body text
            sender: Sender email address

        Returns:
            Dict with bill fields (id, name, amount, merchant, due_date, recurring, status)
        """
        full_text = f"{subject}\n{body}"

        return {
            "id": str(uuid.uuid4()),
            "name": subject[:100],
            "amount": cls.parse_amount(full_text),
            "merchant": cls.parse_merchant(full_text),
            "due_date": cls.parse_due_date(full_text),
            "recurring": cls.detect_recurring(full_text),
            "status": "upcoming",
            "source_email_id": None,
        }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Bill parser")
    parser.add_argument("--subject", required=True)
    parser.add_argument("--body", default="")
    parser.add_argument("--sender", default="")
    args = parser.parse_args()

    result = BillParser.parse_email(args.subject, args.body, args.sender)
    # Convert date to string for JSON serialization
    if result["due_date"]:
        result["due_date"] = result["due_date"].isoformat()
    print(json.dumps(result, indent=2))
