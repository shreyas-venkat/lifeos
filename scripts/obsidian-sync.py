"""Obsidian vault sync for LifeOS daily summaries.

Writes daily summaries and learned preferences to MyVault repo,
then commits and pushes.
"""

import json
import os
from datetime import date, datetime
from pathlib import Path


class ObsidianSync:
    """Syncs LifeOS data to Obsidian vault."""

    def __init__(self, vault_path: str | None = None):
        self.vault_path = Path(vault_path or os.environ.get("OBSIDIAN_VAULT_PATH", "~/MyVault"))
        self.vault_path = self.vault_path.expanduser()
        self.lifeos_dir = self.vault_path / "LifeOS"
        self.summaries_dir = self.lifeos_dir / "daily-summaries"

    def ensure_directories(self) -> None:
        """Create LifeOS directories in vault if they don't exist."""
        self.summaries_dir.mkdir(parents=True, exist_ok=True)

    def write_daily_summary(self, summary_date: date, data: dict) -> Path:
        """Write daily summary markdown file.

        Args:
            summary_date: The date for the summary
            data: Dict with keys: health, meals, activity, bot_actions
        """
        self.ensure_directories()

        filename = f"{summary_date.isoformat()}.md"
        filepath = self.summaries_dir / filename

        content = f"# Daily Summary — {summary_date.strftime('%A, %B %d, %Y')}\n\n"

        if "health" in data:
            content += "## Health\n"
            health = data["health"]
            if "steps" in health:
                content += f"- Steps: {health['steps']:,}\n"
            if "sleep_hours" in health:
                content += f"- Sleep: {health['sleep_hours']:.1f} hours\n"
            if "weight" in health:
                content += f"- Weight: {health['weight']} kg\n"
            if "calories" in health:
                content += f"- Calories: {health['calories']:,.0f} kcal\n"
            content += "\n"

        if "meals" in data:
            content += "## Meals\n"
            for meal in data["meals"]:
                content += f"- **{meal.get('type', 'Meal')}**: {meal.get('description', 'N/A')}\n"
            content += "\n"

        if "activity" in data:
            content += "## Activity\n"
            content += data["activity"] + "\n\n"

        if "bot_actions" in data:
            content += "## LifeOS Actions\n"
            for action in data["bot_actions"]:
                content += f"- {action}\n"
            content += "\n"

        filepath.write_text(content, encoding="utf-8")
        return filepath

    def update_preferences(self, preferences: dict) -> Path:
        """Update learned preferences file.

        Args:
            preferences: Dict of learned user preferences
        """
        self.ensure_directories()
        filepath = self.lifeos_dir / "learned-preferences.md"

        content = "# Learned Preferences\n\n"
        content += f"*Last updated: {datetime.now().strftime('%Y-%m-%d %H:%M')}*\n\n"

        for category, prefs in preferences.items():
            content += f"## {category}\n"
            if isinstance(prefs, list):
                for pref in prefs:
                    content += f"- {pref}\n"
            elif isinstance(prefs, dict):
                for key, value in prefs.items():
                    content += f"- **{key}**: {value}\n"
            else:
                content += f"- {prefs}\n"
            content += "\n"

        filepath.write_text(content, encoding="utf-8")
        return filepath

    def update_health_insights(self, insights: list[str]) -> Path:
        """Update health insights file."""
        self.ensure_directories()
        filepath = self.lifeos_dir / "health-insights.md"

        content = "# Health Insights\n\n"
        content += f"*Last updated: {datetime.now().strftime('%Y-%m-%d %H:%M')}*\n\n"
        for insight in insights:
            content += f"- {insight}\n"

        filepath.write_text(content, encoding="utf-8")
        return filepath

    def git_commit_and_push(self, message: str = "LifeOS daily update") -> dict:
        """Commit changes and push to remote.

        Returns dict with commit status.
        """
        import git

        try:
            repo = git.Repo(self.vault_path)
            repo.git.add(A=True)

            if not repo.is_dirty(untracked_files=True):
                return {"status": "no_changes", "message": "Nothing to commit"}

            commit = repo.index.commit(message)
            origin = repo.remote("origin")
            origin.push()

            return {
                "status": "pushed",
                "commit": str(commit),
                "message": message,
            }
        except git.exc.GitCommandError as e:
            return {"status": "error", "error": str(e)}


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Obsidian sync")
    parser.add_argument("action", choices=["summary", "preferences", "insights", "push"])
    parser.add_argument("--date", help="Date for summary (YYYY-MM-DD)", default=None)
    parser.add_argument("--data", help="JSON data string", default="{}")
    args = parser.parse_args()

    sync = ObsidianSync()

    if args.action == "summary":
        d = date.fromisoformat(args.date) if args.date else date.today()
        result = sync.write_daily_summary(d, json.loads(args.data))
        print(json.dumps({"file": str(result)}))
    elif args.action == "preferences":
        result = sync.update_preferences(json.loads(args.data))
        print(json.dumps({"file": str(result)}))
    elif args.action == "insights":
        result = sync.update_health_insights(json.loads(args.data))
        print(json.dumps({"file": str(result)}))
    elif args.action == "push":
        result = sync.git_commit_and_push()
        print(json.dumps(result))
