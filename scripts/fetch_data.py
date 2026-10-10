#!/usr/bin/env python3
"""
Market City data-prep script.

Downloads daily OHLCV (split/dividend adjusted) plus approximate annual fundamentals
and earnings dates via yfinance, and writes compact JSON into public/data:

    public/data/manifest.json        calendar, company metadata, fundamentals, earnings days
    public/data/prices/<ID>.json     columnar OHLCV aligned to the calendar
    public/data/prices/_INDEX.json   the city index (SPY by default)

All money values are written in the source currency (USD); the game converts with `fx`.
Fundamentals are APPROXIMATE: yfinance only exposes ~4 recent fiscal years, older
years are back-filled from the earliest available year and growth trend.

Usage:
    python -m venv .venv && .venv/Scripts/activate   (Windows)  |  source .venv/bin/activate
    pip install -r scripts/requirements.txt
    python scripts/fetch_data.py                      # full universe
    python scripts/fetch_data.py --only AAPL,MSFT     # quick test
    python scripts/fetch_data.py --only AVB --merge   # retry one ticker, keep the rest
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    import pandas as pd
    import yfinance as yf
except ImportError:  # pragma: no cover
    sys.exit("Missing dependencies. Run: pip install -r scripts/requirements.txt")

ROOT = Path(__file__).resolve().parent.parent
INDEX_ID = "_INDEX"


def rnd(x: float) -> float | None:
    """Compact rounding that keeps precision for low (split-adjusted) prices."""
    if x is None or not math.isfinite(x):
        return None
    a = abs(x)
    if a >= 100:
        return round(x, 2)
    if a >= 1:
        return round(x, 3)
    return round(x, 5)


def fiscal_year(ts: pd.Timestamp) -> int:
    # Fiscal years ending in Jan–May mostly cover the previous calendar year (e.g. NVDA, WMT).
    return ts.year if ts.month >= 6 else ts.year - 1


def download_history(ticker: str, start: str, end: str) -> pd.DataFrame:
    df = yf.Ticker(ticker).history(start=start, end=end, auto_adjust=True, actions=False)
    if df.empty:
        return df
    df.index = pd.to_datetime(df.index).tz_localize(None).normalize()
    return df[["Open", "High", "Low", "Close", "Volume"]].dropna(subset=["Close"])


def series_json(df: pd.DataFrame, calendar: list[str]) -> dict | None:
    """Align to the calendar; fill short gaps (halts) with flat bars."""
    if df.empty:
        return None
    idx = pd.DatetimeIndex(pd.to_datetime(calendar))
    df = df[~df.index.duplicated()].reindex(idx)
    valid = df["Close"].notna()
    if not valid.any():
        return None
    first = int(valid.values.argmax())
    last = int(len(valid) - 1 - valid.values[::-1].argmax())
    df = df.iloc[first : last + 1].copy()
    df["Close"] = df["Close"].ffill()
    for col in ("Open", "High", "Low"):
        df[col] = df[col].fillna(df["Close"])
    df["Volume"] = df["Volume"].fillna(0)
    return {
        "start": first,
        "o": [rnd(v) for v in df["Open"]],
        "h": [rnd(v) for v in df["High"]],
        "l": [rnd(v) for v in df["Low"]],
        "c": [rnd(v) for v in df["Close"]],
        "v": [int(v) for v in df["Volume"]],
    }


def pick_row(frame: pd.DataFrame, names: list[str]) -> pd.Series | None:
    for n in names:
        if n in frame.index:
            row = frame.loc[n]
            if row.notna().any():
                return row
    return None


def fundamentals(t: yf.Ticker, first_year: int, last_year: int) -> list[dict]:
    """Approximate annual fundamentals; older years back-filled from the earliest reported year."""
    years: dict[int, dict] = {}
    try:
        inc = t.income_stmt
        bal = t.balance_sheet
    except Exception as e:  # noqa: BLE001
        print(f"    ! financials unavailable: {e}")
        inc, bal = pd.DataFrame(), pd.DataFrame()

    rev = pick_row(inc, ["Total Revenue", "Operating Revenue"]) if not inc.empty else None
    ni = pick_row(inc, ["Net Income", "Net Income Common Stockholders", "Net Income From Continuing Operation Net Minority Interest"]) if not inc.empty else None
    eq = pick_row(bal, ["Stockholders Equity", "Common Stock Equity", "Total Equity Gross Minority Interest"]) if not bal.empty else None
    debt = pick_row(bal, ["Total Debt", "Long Term Debt"]) if not bal.empty else None

    if rev is not None:
        for col, value in rev.items():
            if pd.isna(value):
                continue
            y = fiscal_year(pd.Timestamp(col))
            e = float(eq[col]) if eq is not None and col in eq and pd.notna(eq[col]) else None
            d = float(debt[col]) if debt is not None and col in debt and pd.notna(debt[col]) else 0.0
            years[y] = {
                "revenue": float(value),
                "netIncome": float(ni[col]) if ni is not None and col in ni and pd.notna(ni[col]) else 0.0,
                "equity": e,
                "debtToEquity": (d / e) if e and e > 0 else 3.0,
            }

    # Dividends per share by calendar year (split-adjusted by yfinance).
    divs: dict[int, float] = {}
    try:
        dv = t.dividends
        if not dv.empty:
            dv.index = pd.to_datetime(dv.index).tz_localize(None)
            divs = {int(k): float(v) for k, v in dv.groupby(dv.index.year).sum().items()}
    except Exception:  # noqa: BLE001
        pass

    if not years:
        return []

    known = sorted(years)
    y0, y1 = known[0], known[-1]
    # Revenue CAGR across known years, clamped, used to back-fill older years.
    if y1 > y0 and years[y0]["revenue"] > 0 and years[y1]["revenue"] > 0:
        cagr = (years[y1]["revenue"] / years[y0]["revenue"]) ** (1 / (y1 - y0)) - 1
    else:
        cagr = 0.05
    cagr = max(-0.1, min(0.3, cagr))

    out = []
    for y in range(first_year, last_year + 1):
        if y in years:
            f = dict(years[y])
        elif y < y0:
            base = years[y0]
            k = (1 + cagr) ** (y0 - y)
            f = {
                "revenue": base["revenue"] / k,
                "netIncome": base["netIncome"] / k,
                "equity": (base["equity"] / k) if base["equity"] else None,
                "debtToEquity": base["debtToEquity"],
            }
        else:
            f = dict(years[y1])  # carry the latest year forward
        if not f.get("equity"):
            f["equity"] = max(f["revenue"] * 0.3, 1.0)
        out.append(
            {
                "year": y,
                "revenue": round(f["revenue"]),
                "netIncome": round(f["netIncome"]),
                "equity": round(f["equity"]),
                "debtToEquity": round(f["debtToEquity"], 3),
                "dividendPerShare": round(divs.get(y, 0.0), 4),
            }
        )
    return out


def earnings_days(t: yf.Ticker, calendar: list[str]) -> list[int]:
    try:
        ed = t.get_earnings_dates(limit=60)
    except Exception:  # noqa: BLE001
        return []
    if ed is None or ed.empty:
        return []
    cal = pd.DatetimeIndex(pd.to_datetime(calendar))
    days = set()
    for ts in ed.index:
        ts = pd.Timestamp(ts)
        local = ts.tz_convert("America/New_York") if ts.tzinfo else ts
        d = local.tz_localize(None).normalize() if local.tzinfo else local.normalize()
        # After-close announcements move the price on the next trading day.
        if local.hour >= 16:
            d = d + pd.Timedelta(days=1)
        i = int(cal.searchsorted(d))
        if 0 <= i < len(cal):
            days.add(i)
    return sorted(days)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--start", default="2014-01-01")
    ap.add_argument("--end", default="2025-12-31")
    ap.add_argument("--fx", type=float, default=35.0, help="USD→THB conversion applied by the game")
    ap.add_argument("--universe", default=str(ROOT / "scripts" / "universe.json"))
    ap.add_argument("--out", default=str(ROOT / "public" / "data"))
    ap.add_argument("--only", default="", help="Comma-separated tickers to include")
    ap.add_argument("--merge", action="store_true", help="Keep companies already in manifest.json and add/replace the fetched ones")
    ap.add_argument("--sleep", type=float, default=0.4, help="Pause between tickers (rate limiting)")
    args = ap.parse_args()

    universe = json.loads(Path(args.universe).read_text(encoding="utf-8"))
    only = {s.strip().upper() for s in args.only.split(",") if s.strip()}
    entries = [c for c in universe["companies"] if not only or c["ticker"].upper() in only]

    out = Path(args.out)
    (out / "prices").mkdir(parents=True, exist_ok=True)

    print(f"Index {universe['index']['ticker']} …")
    idx = download_history(universe["index"]["ticker"], args.start, args.end)
    if idx.empty:
        sys.exit("Could not download index data.")
    calendar = [d.strftime("%Y-%m-%d") for d in idx.index]
    idx_json = series_json(idx, calendar)
    (out / "prices" / f"{INDEX_ID}.json").write_text(json.dumps(idx_json, separators=(",", ":")), encoding="utf-8")

    first_year = int(args.start[:4]) - 1
    last_year = int(args.end[:4])
    companies = []
    for n, c in enumerate(entries, 1):
        tk = c["ticker"]
        print(f"[{n}/{len(entries)}] {tk}")
        try:
            t = yf.Ticker(tk)
            hist = download_history(tk, args.start, args.end)
            s = series_json(hist, calendar)
            if s is None:
                print("    ! no prices, skipped")
                continue
            info = {}
            try:
                info = t.get_info()
            except Exception:  # noqa: BLE001
                pass
            shares = info.get("sharesOutstanding") or info.get("impliedSharesOutstanding")
            if not shares:
                try:
                    sh = t.get_shares_full(start=args.start)
                    shares = float(sh.dropna().iloc[-1]) if sh is not None and not sh.empty else None
                except Exception:  # noqa: BLE001
                    shares = None
            if not shares:
                print("    ! no share count, skipped")
                continue
            funds = fundamentals(t, first_year, last_year)
            if not funds:
                print("    ! no fundamentals, skipped")
                continue
            (out / "prices" / f"{tk}.json").write_text(json.dumps(s, separators=(",", ":")), encoding="utf-8")
            companies.append(
                {
                    "id": tk,
                    "ticker": tk,
                    "name": info.get("longName") or info.get("shortName") or tk,
                    "sector": c["sector"],
                    "descTh": c["descTh"],
                    "industryTh": c["industryTh"],
                    "sharesOutstanding": float(shares),
                    "firstDay": s["start"],
                    "lastDay": s["start"] + len(s["c"]) - 1,
                    "fundamentals": funds,
                    "earningsDays": earnings_days(t, calendar),
                }
            )
        except Exception as e:  # noqa: BLE001
            print(f"    ! failed: {e}")
        time.sleep(args.sleep)

    if args.merge and (out / "manifest.json").exists():
        old = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
        if old.get("calendar") == calendar:
            fetched = {c["id"] for c in companies}
            companies = [c for c in old["companies"] if c["id"] not in fetched] + companies
        else:
            print("    ! calendar changed, cannot merge — writing fetched companies only")

    manifest = {
        "version": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "Yahoo Finance (yfinance)",
        "currency": "USD",
        "fx": args.fx,
        "calendar": calendar,
        "index": universe["index"],
        "companies": companies,
    }
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"\nDone: {len(companies)} companies, {len(calendar)} trading days → {out}")


if __name__ == "__main__":
    main()
