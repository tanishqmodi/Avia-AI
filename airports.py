"""
AdminDash: airports lookup service.

Pulls the OurAirports open dataset (medium + large airports with IATA codes)
on first use and caches on disk. Falls back to a bundled list if offline.
"""
import csv
import io
import logging
import threading
import urllib.request
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, Query

from auth import get_current_user

logger = logging.getLogger("skyguard.airports")

router = APIRouter(prefix="/api/airports", tags=["airports"])

AIRPORTS_URL = "https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv"
DATA_DIR = Path(__file__).parent / "data"
DATA_FILE = DATA_DIR / "airports.csv"

FALLBACK_AIRPORTS = [
    {"iata": "ATL", "icao": "KATL", "name": "Hartsfield-Jackson Atlanta International Airport", "city": "Atlanta", "country": "US"},
    {"iata": "LAX", "icao": "KLAX", "name": "Los Angeles International Airport", "city": "Los Angeles", "country": "US"},
    {"iata": "ORD", "icao": "KORD", "name": "O'Hare International Airport", "city": "Chicago", "country": "US"},
    {"iata": "DFW", "icao": "KDFW", "name": "Dallas/Fort Worth International Airport", "city": "Dallas-Fort Worth", "country": "US"},
    {"iata": "DEN", "icao": "KDEN", "name": "Denver International Airport", "city": "Denver", "country": "US"},
    {"iata": "JFK", "icao": "KJFK", "name": "John F. Kennedy International Airport", "city": "New York", "country": "US"},
    {"iata": "SFO", "icao": "KSFO", "name": "San Francisco International Airport", "city": "San Francisco", "country": "US"},
    {"iata": "SEA", "icao": "KSEA", "name": "Seattle-Tacoma International Airport", "city": "Seattle", "country": "US"},
    {"iata": "MIA", "icao": "KMIA", "name": "Miami International Airport", "city": "Miami", "country": "US"},
    {"iata": "BOS", "icao": "KBOS", "name": "Logan International Airport", "city": "Boston", "country": "US"},
    {"iata": "EWR", "icao": "KEWR", "name": "Newark Liberty International Airport", "city": "Newark", "country": "US"},
    {"iata": "LGA", "icao": "KLGA", "name": "LaGuardia Airport", "city": "New York", "country": "US"},
    {"iata": "LHR", "icao": "EGLL", "name": "London Heathrow Airport", "city": "London", "country": "GB"},
    {"iata": "LGW", "icao": "EGKK", "name": "London Gatwick Airport", "city": "London", "country": "GB"},
    {"iata": "CDG", "icao": "LFPG", "name": "Paris Charles de Gaulle Airport", "city": "Paris", "country": "FR"},
    {"iata": "ORY", "icao": "LFPO", "name": "Paris-Orly Airport", "city": "Paris", "country": "FR"},
    {"iata": "AMS", "icao": "EHAM", "name": "Amsterdam Airport Schiphol", "city": "Amsterdam", "country": "NL"},
    {"iata": "FRA", "icao": "EDDF", "name": "Frankfurt am Main Airport", "city": "Frankfurt", "country": "DE"},
    {"iata": "MUC", "icao": "EDDM", "name": "Munich Airport", "city": "Munich", "country": "DE"},
    {"iata": "MAD", "icao": "LEMD", "name": "Adolfo Suarez Madrid-Barajas Airport", "city": "Madrid", "country": "ES"},
    {"iata": "BCN", "icao": "LEBL", "name": "Barcelona-El Prat Airport", "city": "Barcelona", "country": "ES"},
    {"iata": "FCO", "icao": "LIRF", "name": "Leonardo da Vinci-Fiumicino Airport", "city": "Rome", "country": "IT"},
    {"iata": "ZRH", "icao": "LSZH", "name": "Zurich Airport", "city": "Zurich", "country": "CH"},
    {"iata": "VIE", "icao": "LOWW", "name": "Vienna International Airport", "city": "Vienna", "country": "AT"},
    {"iata": "CPH", "icao": "EKCH", "name": "Copenhagen Airport", "city": "Copenhagen", "country": "DK"},
    {"iata": "ARN", "icao": "ESSA", "name": "Stockholm-Arlanda Airport", "city": "Stockholm", "country": "SE"},
    {"iata": "OSL", "icao": "ENGM", "name": "Oslo Airport, Gardermoen", "city": "Oslo", "country": "NO"},
    {"iata": "IST", "icao": "LTFM", "name": "Istanbul Airport", "city": "Istanbul", "country": "TR"},
    {"iata": "DXB", "icao": "OMDB", "name": "Dubai International Airport", "city": "Dubai", "country": "AE"},
    {"iata": "DOH", "icao": "OTHH", "name": "Hamad International Airport", "city": "Doha", "country": "QA"},
    {"iata": "AUH", "icao": "OMAA", "name": "Abu Dhabi International Airport", "city": "Abu Dhabi", "country": "AE"},
    {"iata": "DEL", "icao": "VIDP", "name": "Indira Gandhi International Airport", "city": "New Delhi", "country": "IN"},
    {"iata": "BOM", "icao": "VABB", "name": "Chhatrapati Shivaji Maharaj International Airport", "city": "Mumbai", "country": "IN"},
    {"iata": "BLR", "icao": "VOBL", "name": "Kempegowda International Airport", "city": "Bengaluru", "country": "IN"},
    {"iata": "MAA", "icao": "VOMM", "name": "Chennai International Airport", "city": "Chennai", "country": "IN"},
    {"iata": "CCU", "icao": "VECC", "name": "Netaji Subhash Chandra Bose International Airport", "city": "Kolkata", "country": "IN"},
    {"iata": "HYD", "icao": "VOHS", "name": "Rajiv Gandhi International Airport", "city": "Hyderabad", "country": "IN"},
    {"iata": "NRT", "icao": "RJAA", "name": "Narita International Airport", "city": "Tokyo", "country": "JP"},
    {"iata": "HND", "icao": "RJTT", "name": "Haneda Airport", "city": "Tokyo", "country": "JP"},
    {"iata": "KIX", "icao": "RJBB", "name": "Kansai International Airport", "city": "Osaka", "country": "JP"},
    {"iata": "ICN", "icao": "RKSI", "name": "Incheon International Airport", "city": "Seoul", "country": "KR"},
    {"iata": "HKG", "icao": "VHHH", "name": "Hong Kong International Airport", "city": "Hong Kong", "country": "HK"},
    {"iata": "SIN", "icao": "WSSS", "name": "Singapore Changi Airport", "city": "Singapore", "country": "SG"},
    {"iata": "BKK", "icao": "VTBS", "name": "Suvarnabhumi Airport", "city": "Bangkok", "country": "TH"},
    {"iata": "KUL", "icao": "WMKK", "name": "Kuala Lumpur International Airport", "city": "Kuala Lumpur", "country": "MY"},
    {"iata": "CGK", "icao": "WIII", "name": "Soekarno-Hatta International Airport", "city": "Jakarta", "country": "ID"},
    {"iata": "MNL", "icao": "RPLL", "name": "Ninoy Aquino International Airport", "city": "Manila", "country": "PH"},
    {"iata": "PEK", "icao": "ZBAA", "name": "Beijing Capital International Airport", "city": "Beijing", "country": "CN"},
    {"iata": "PKX", "icao": "ZBAD", "name": "Beijing Daxing International Airport", "city": "Beijing", "country": "CN"},
    {"iata": "PVG", "icao": "ZSPD", "name": "Shanghai Pudong International Airport", "city": "Shanghai", "country": "CN"},
    {"iata": "CAN", "icao": "ZGGG", "name": "Guangzhou Baiyun International Airport", "city": "Guangzhou", "country": "CN"},
    {"iata": "TPE", "icao": "RCTP", "name": "Taiwan Taoyuan International Airport", "city": "Taipei", "country": "TW"},
    {"iata": "SYD", "icao": "YSSY", "name": "Sydney Kingsford Smith Airport", "city": "Sydney", "country": "AU"},
    {"iata": "MEL", "icao": "YMML", "name": "Melbourne Airport", "city": "Melbourne", "country": "AU"},
    {"iata": "BNE", "icao": "YBBN", "name": "Brisbane Airport", "city": "Brisbane", "country": "AU"},
    {"iata": "PER", "icao": "YPPH", "name": "Perth Airport", "city": "Perth", "country": "AU"},
    {"iata": "AKL", "icao": "NZAA", "name": "Auckland Airport", "city": "Auckland", "country": "NZ"},
    {"iata": "YYZ", "icao": "CYYZ", "name": "Toronto Pearson International Airport", "city": "Toronto", "country": "CA"},
    {"iata": "YVR", "icao": "CYVR", "name": "Vancouver International Airport", "city": "Vancouver", "country": "CA"},
    {"iata": "YUL", "icao": "CYUL", "name": "Montreal-Trudeau International Airport", "city": "Montreal", "country": "CA"},
    {"iata": "GRU", "icao": "SBGR", "name": "Sao Paulo-Guarulhos International Airport", "city": "Sao Paulo", "country": "BR"},
    {"iata": "GIG", "icao": "SBGL", "name": "Rio de Janeiro-Galeao International Airport", "city": "Rio de Janeiro", "country": "BR"},
    {"iata": "EZE", "icao": "SAEZ", "name": "Ministro Pistarini International Airport", "city": "Buenos Aires", "country": "AR"},
    {"iata": "SCL", "icao": "SCEL", "name": "Santiago International Airport", "city": "Santiago", "country": "CL"},
    {"iata": "MEX", "icao": "MMMX", "name": "Mexico City International Airport", "city": "Mexico City", "country": "MX"},
    {"iata": "JNB", "icao": "FAOR", "name": "O.R. Tambo International Airport", "city": "Johannesburg", "country": "ZA"},
    {"iata": "CPT", "icao": "FACT", "name": "Cape Town International Airport", "city": "Cape Town", "country": "ZA"},
    {"iata": "CAI", "icao": "HECA", "name": "Cairo International Airport", "city": "Cairo", "country": "EG"},
    {"iata": "NBO", "icao": "HKJK", "name": "Jomo Kenyatta International Airport", "city": "Nairobi", "country": "KE"},
    {"iata": "SVO", "icao": "UUEE", "name": "Sheremetyevo International Airport", "city": "Moscow", "country": "RU"},
    {"iata": "LED", "icao": "ULLI", "name": "Pulkovo Airport", "city": "Saint Petersburg", "country": "RU"},
    {"iata": "TLV", "icao": "LLBG", "name": "Ben Gurion Airport", "city": "Tel Aviv", "country": "IL"},
    {"iata": "DUB", "icao": "EIDW", "name": "Dublin Airport", "city": "Dublin", "country": "IE"},
]

_airports: list[dict] = []
_loaded = False
_lock = threading.Lock()


def _parse_csv(text: str) -> list[dict]:
    reader = csv.DictReader(io.StringIO(text))
    out: list[dict] = []
    for row in reader:
        if row.get("type") not in ("medium_airport", "large_airport"):
            continue
        iata = (row.get("iata_code") or "").strip()
        if not iata:
            continue
        out.append({
            "iata": iata.upper(),
            "icao": (row.get("ident") or "").strip().upper(),
            "name": (row.get("name") or "").strip(),
            "city": (row.get("municipality") or "").strip(),
            "country": (row.get("iso_country") or "").strip(),
        })
    return out


def _load_cached() -> Optional[list[dict]]:
    if not DATA_FILE.exists():
        return None
    try:
        text = DATA_FILE.read_text(encoding="utf-8")
        parsed = _parse_csv(text)
        if parsed:
            logger.info("Loaded %d airports from cache (%s)", len(parsed), DATA_FILE)
            return parsed
    except Exception as e:
        logger.warning("Failed to read cached airports: %s", e)
    return None


def _download() -> Optional[list[dict]]:
    try:
        DATA_DIR.mkdir(exist_ok=True)
        logger.info("Fetching airports dataset from %s", AIRPORTS_URL)
        req = urllib.request.Request(AIRPORTS_URL, headers={"User-Agent": "SkyGuard/3.0"})
        with urllib.request.urlopen(req, timeout=15) as r:
            text = r.read().decode("utf-8")
        DATA_FILE.write_text(text, encoding="utf-8")
        parsed = _parse_csv(text)
        logger.info("Fetched and parsed %d airports from online dataset", len(parsed))
        return parsed
    except Exception as e:
        logger.warning("Airport dataset download failed (%s); using fallback", e)
        return None


def _ensure_loaded():
    global _airports, _loaded
    with _lock:
        if _loaded:
            return
        data = _load_cached() or _download() or FALLBACK_AIRPORTS
        _airports = data
        _loaded = True


def start_background_load():
    """Kick off dataset load in a background thread (non-blocking startup)."""
    threading.Thread(target=_ensure_loaded, daemon=True).start()


@router.get("/search")
def search_airports(
    q: str = Query(default="", max_length=100),
    limit: int = Query(default=10, ge=1, le=50),
    _: object = Depends(get_current_user),
):
    _ensure_loaded()
    needle = q.strip().lower()
    if not needle:
        return _airports[:limit]

    starts_with: list[dict] = []
    contains: list[dict] = []
    for a in _airports:
        iata_l = a["iata"].lower()
        icao_l = a["icao"].lower()
        name_l = a["name"].lower()
        city_l = a["city"].lower()
        if iata_l == needle or icao_l == needle:
            starts_with.insert(0, a)
        elif iata_l.startswith(needle) or city_l.startswith(needle) or name_l.startswith(needle):
            starts_with.append(a)
        elif needle in name_l or needle in city_l or needle in iata_l or needle in icao_l:
            contains.append(a)
        if len(starts_with) + len(contains) >= limit * 3:
            break

    return (starts_with + contains)[:limit]


@router.get("/{iata}")
def get_airport(iata: str, _: object = Depends(get_current_user)):
    _ensure_loaded()
    code = iata.upper()
    for a in _airports:
        if a["iata"] == code:
            return a
    return None
