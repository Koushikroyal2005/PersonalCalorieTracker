from datetime import date, timedelta

from app.application.services.report_service import ReportService


def test_custom_date_bounds_include_entire_end_day_in_india() -> None:
    start, end = ReportService.date_bounds(
        "7d",
        date(2026, 8, 10),
        date(2026, 8, 15),
    )

    assert end - start == timedelta(days=6)
    assert start.isoformat() == "2026-08-09T18:30:00+00:00"
    assert end.isoformat() == "2026-08-15T18:30:00+00:00"


def test_preset_bounds_have_requested_duration() -> None:
    start, end = ReportService.date_bounds("30d")

    assert end - start == timedelta(days=30)


def test_daily_labels_include_days_without_entries() -> None:
    labels = ReportService.period_labels(
        "7d",
        "daily",
        date(2026, 8, 10),
        date(2026, 8, 12),
    )

    assert labels == ["2026-08-10", "2026-08-11", "2026-08-12"]


def test_weekly_labels_are_unique_and_ordered() -> None:
    labels = ReportService.period_labels(
        "7d",
        "weekly",
        date(2026, 8, 15),
        date(2026, 8, 18),
    )

    assert labels == ["2026-W33", "2026-W34"]
