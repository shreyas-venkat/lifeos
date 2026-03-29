"""Tests for obsidian-sync.py."""

import importlib
from datetime import date
from pathlib import Path
from unittest.mock import MagicMock, patch

_spec = importlib.util.spec_from_file_location(
    "obsidian_sync", Path(__file__).parent / "obsidian-sync.py"
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

ObsidianSync = _mod.ObsidianSync


class TestEnsureDirectories:
    def test_creates_directories(self, tmp_path):
        sync = ObsidianSync(vault_path=str(tmp_path))
        sync.ensure_directories()
        assert (tmp_path / "LifeOS" / "daily-summaries").is_dir()

    def test_idempotent(self, tmp_path):
        sync = ObsidianSync(vault_path=str(tmp_path))
        sync.ensure_directories()
        sync.ensure_directories()  # should not raise
        assert (tmp_path / "LifeOS" / "daily-summaries").is_dir()


class TestWriteDailySummary:
    def test_creates_file_with_correct_name(self, tmp_path):
        sync = ObsidianSync(vault_path=str(tmp_path))
        result = sync.write_daily_summary(date(2025, 3, 15), {})
        assert result.name == "2025-03-15.md"
        assert result.exists()

    def test_health_section(self, tmp_path):
        sync = ObsidianSync(vault_path=str(tmp_path))
        data = {"health": {"steps": 10000, "sleep_hours": 7.5, "weight": 75, "calories": 2100}}
        result = sync.write_daily_summary(date(2025, 3, 15), data)
        content = result.read_text(encoding="utf-8")
        assert "## Health" in content
        assert "Steps: 10,000" in content
        assert "Sleep: 7.5 hours" in content
        assert "Weight: 75 kg" in content
        assert "Calories: 2,100 kcal" in content

    def test_meals_section(self, tmp_path):
        sync = ObsidianSync(vault_path=str(tmp_path))
        data = {
            "meals": [
                {"type": "Breakfast", "description": "Oatmeal"},
                {"type": "Lunch", "description": "Salad"},
            ]
        }
        result = sync.write_daily_summary(date(2025, 3, 15), data)
        content = result.read_text(encoding="utf-8")
        assert "## Meals" in content
        assert "**Breakfast**: Oatmeal" in content
        assert "**Lunch**: Salad" in content

    def test_activity_section(self, tmp_path):
        sync = ObsidianSync(vault_path=str(tmp_path))
        data = {"activity": "Morning run: 5km in 28 minutes"}
        result = sync.write_daily_summary(date(2025, 3, 15), data)
        content = result.read_text(encoding="utf-8")
        assert "## Activity" in content
        assert "Morning run: 5km in 28 minutes" in content

    def test_bot_actions_section(self, tmp_path):
        sync = ObsidianSync(vault_path=str(tmp_path))
        data = {"bot_actions": ["Triggered sunrise alarm", "Started vacuum"]}
        result = sync.write_daily_summary(date(2025, 3, 15), data)
        content = result.read_text(encoding="utf-8")
        assert "## LifeOS Actions" in content
        assert "- Triggered sunrise alarm" in content
        assert "- Started vacuum" in content

    def test_empty_data(self, tmp_path):
        sync = ObsidianSync(vault_path=str(tmp_path))
        result = sync.write_daily_summary(date(2025, 3, 15), {})
        content = result.read_text(encoding="utf-8")
        assert "# Daily Summary" in content
        assert "Saturday, March 15, 2025" in content

    def test_header_date_formatting(self, tmp_path):
        sync = ObsidianSync(vault_path=str(tmp_path))
        result = sync.write_daily_summary(date(2025, 1, 1), {})
        content = result.read_text(encoding="utf-8")
        assert "Wednesday, January 01, 2025" in content


class TestUpdatePreferences:
    def test_list_preferences(self, tmp_path):
        sync = ObsidianSync(vault_path=str(tmp_path))
        prefs = {"Food": ["No spicy food", "Prefers salads"]}
        result = sync.update_preferences(prefs)
        content = result.read_text(encoding="utf-8")
        assert "## Food" in content
        assert "- No spicy food" in content
        assert "- Prefers salads" in content

    def test_dict_preferences(self, tmp_path):
        sync = ObsidianSync(vault_path=str(tmp_path))
        prefs = {"Schedule": {"wake_up": "7:00 AM", "bedtime": "11:00 PM"}}
        result = sync.update_preferences(prefs)
        content = result.read_text(encoding="utf-8")
        assert "**wake_up**: 7:00 AM" in content
        assert "**bedtime**: 11:00 PM" in content

    def test_scalar_preference(self, tmp_path):
        sync = ObsidianSync(vault_path=str(tmp_path))
        prefs = {"Theme": "dark mode preferred"}
        result = sync.update_preferences(prefs)
        content = result.read_text(encoding="utf-8")
        assert "- dark mode preferred" in content

    def test_file_location(self, tmp_path):
        sync = ObsidianSync(vault_path=str(tmp_path))
        result = sync.update_preferences({})
        assert result == tmp_path / "LifeOS" / "learned-preferences.md"


class TestUpdateHealthInsights:
    def test_writes_insights(self, tmp_path):
        sync = ObsidianSync(vault_path=str(tmp_path))
        insights = ["Average sleep improving", "Step count below target"]
        result = sync.update_health_insights(insights)
        content = result.read_text(encoding="utf-8")
        assert "# Health Insights" in content
        assert "- Average sleep improving" in content
        assert "- Step count below target" in content

    def test_file_location(self, tmp_path):
        sync = ObsidianSync(vault_path=str(tmp_path))
        result = sync.update_health_insights([])
        assert result == tmp_path / "LifeOS" / "health-insights.md"


class TestGitCommitAndPush:
    def test_no_changes(self, tmp_path):
        sync = ObsidianSync(vault_path=str(tmp_path))
        mock_repo = MagicMock()
        mock_repo.is_dirty.return_value = False

        with patch("git.Repo", return_value=mock_repo):
            result = sync.git_commit_and_push()

        assert result["status"] == "no_changes"

    def test_commit_and_push(self, tmp_path):
        sync = ObsidianSync(vault_path=str(tmp_path))
        mock_repo = MagicMock()
        mock_repo.is_dirty.return_value = True
        mock_repo.index.commit.return_value = "abc123"
        mock_origin = MagicMock()
        mock_repo.remote.return_value = mock_origin

        with patch("git.Repo", return_value=mock_repo):
            result = sync.git_commit_and_push("test message")

        assert result["status"] == "pushed"
        assert result["commit"] == "abc123"
        assert result["message"] == "test message"
        mock_repo.git.add.assert_called_once_with(A=True)
        mock_origin.push.assert_called_once()

    def test_git_error(self, tmp_path):
        import git

        sync = ObsidianSync(vault_path=str(tmp_path))
        mock_repo = MagicMock()
        mock_repo.is_dirty.return_value = True
        mock_repo.index.commit.side_effect = git.exc.GitCommandError("push", "failed")

        with patch("git.Repo", return_value=mock_repo):
            result = sync.git_commit_and_push()

        assert result["status"] == "error"
        assert "error" in result
