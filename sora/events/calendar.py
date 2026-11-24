"""Festival smoke alerts from a calendar (spec §30.3 "calendar priors": Diwali, Bhogi).

shortcut: a hand-kept table of dates, checked in Nov 2026 against panchang listings (Diwali 2028 had weaker
agreement between sources). Extend it every year; a festival not in the table simply gets no alert.
"""
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))
ALL = {"delhi", "kolkata", "mumbai", "chennai"}

# (date, start hour IST, hours, cities, title, body)
FESTIVALS = [
    ("2027-01-14", 4, 6, {"chennai"}, "Bhogi bonfires",
     "Old things are burnt at dawn for Bhogi. Smoke peaks in the early morning and usually clears by mid-morning."),
    ("2027-10-29", 18, 12, ALL, "Diwali fireworks",
     "Fireworks raise PM2.5 sharply from the evening into the night, most near residential areas."),
    ("2028-10-17", 18, 12, ALL, "Diwali fireworks",
     "Fireworks raise PM2.5 sharply from the evening into the night, most near residential areas."),
]
PROBABILITY = 0.9  # the date is certain; how much smoke reaches a given street is not


def iso(t: datetime) -> str:
    return t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def upcoming(city: str, times: list[str]) -> list[dict]:
    """Contract ApiEvent list for festivals overlapping the forecast window [times[0], times[-1]]."""
    lo = datetime.fromisoformat(times[0].replace("Z", "+00:00"))
    hi = datetime.fromisoformat(times[-1].replace("Z", "+00:00"))
    out = []
    for date, hour, hours, cities, title, body in FESTIVALS:
        start = datetime.fromisoformat(date).replace(hour=hour, tzinfo=IST)
        end = start + timedelta(hours=hours)
        if city in cities and start < hi and end > lo:
            out.append({"kind": "festival", "title": title, "body": body, "start": iso(start), "end": iso(end),
                        "severity": "warning", "probability": PROBABILITY})
    return out
