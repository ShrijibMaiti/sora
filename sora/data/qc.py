"""Station quality control (spec §12.4). Missing values are left missing, never imputed."""
import pandas as pd


def _stuck(s):
    run = (s != s.shift()).cumsum()
    return s.groupby(run).transform("size") >= 5  # same value 5 h in a row: flat-lined analyser


def clean(df):
    """Hourly mean per station with impossible, stuck and isolated-spike values removed."""
    df = df.groupby(["station", "time"], as_index=False).agg(
        lat=("lat", "first"), lon=("lon", "first"), value=("value", "mean"))
    df = df[(df.value > 0) & (df.value < 1500)].sort_values(["station", "time"])  # negatives, unit errors
    stuck = df.groupby("station", group_keys=False)["value"].apply(_stuck)
    med = df.groupby("station")["value"].transform(lambda s: s.rolling(24, center=True, min_periods=6).median())
    spike = df.value > 4 * med + 50
    return df[~(stuck | spike)].reset_index(drop=True)
