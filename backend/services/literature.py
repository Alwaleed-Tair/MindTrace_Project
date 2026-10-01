"""Scholarly literature search for the originality estimate: SCIENTIFIC sources only, no general web.

Google Scholar has no public API (scraping it is against its terms and gets blocked), so the platform searches the open
scholarly indexes instead: OpenAlex, Semantic Scholar, arXiv and Crossref. Each one is optional: a source that is down or
rate-limited is skipped and the others are used.

What leaves the server: only the few short English search queries that DeepSeek wrote from the notes
(for example "temperature effect on reaction rate"). Never the note text, the audio, or any name.
"""
from __future__ import annotations

import os
import re
import xml.etree.ElementTree as ET
from html import unescape

import httpx

MAX_CANDIDATES = 20
PER_QUERY = 8
ABSTRACT_CHARS = 500
SOURCE_NAMES = {"openalex": "OpenAlex", "semanticscholar": "Semantic Scholar", "arxiv": "arXiv", "crossref": "Crossref"}


def _clip(text: str | None, n: int) -> str:
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", text or ""))).strip()[:n]


def _paper(title, authors, year, venue, url, doi, abstract, source) -> dict | None:
    title = _clip(title, 300)
    if not title:
        return None
    return {"title": title, "authors": [_clip(a, 60) for a in (authors or [])[:3] if a], "year": year if isinstance(year, int) else None,
            "venue": _clip(venue, 120), "url": url or (f"https://doi.org/{doi}" if doi else ""), "doi": doi or "",
            "abstract": _clip(abstract, ABSTRACT_CHARS), "source": SOURCE_NAMES[source]}


def _openalex(client: httpx.Client, q: str, headers: dict) -> list[dict]:
    params = {"search": q, "per-page": PER_QUERY, "select": "display_name,publication_year,doi,primary_location,authorships,abstract_inverted_index,id"}
    if os.environ.get("OPENALEX_API_KEY"):
        params["api_key"] = os.environ["OPENALEX_API_KEY"]
    r = client.get("https://api.openalex.org/works", params=params, headers=headers)
    r.raise_for_status()
    out = []
    for w in r.json().get("results", []):
        inv = w.get("abstract_inverted_index") or {}
        words = sorted((pos, word) for word, poss in inv.items() for pos in poss)
        loc = w.get("primary_location") or {}
        doi = (w.get("doi") or "").replace("https://doi.org/", "")
        p = _paper(w.get("display_name"), [(a.get("author") or {}).get("display_name") for a in w.get("authorships", [])], w.get("publication_year"),
                   ((loc.get("source") or {}).get("display_name")), loc.get("landing_page_url") or w.get("id"), doi, " ".join(w for _, w in words), "openalex")
        if p:
            out.append(p)
    return out


def _semanticscholar(client: httpx.Client, q: str, headers: dict) -> list[dict]:
    h = dict(headers)
    if os.environ.get("SEMANTIC_SCHOLAR_API_KEY"):
        h["x-api-key"] = os.environ["SEMANTIC_SCHOLAR_API_KEY"]
    r = client.get("https://api.semanticscholar.org/graph/v1/paper/search", headers=h,
                   params={"query": q, "limit": PER_QUERY, "fields": "title,year,abstract,url,venue,authors,externalIds"})
    r.raise_for_status()
    out = []
    for w in r.json().get("data", []):
        p = _paper(w.get("title"), [a.get("name") for a in w.get("authors", [])], w.get("year"), w.get("venue"), w.get("url"),
                   (w.get("externalIds") or {}).get("DOI"), w.get("abstract"), "semanticscholar")
        if p:
            out.append(p)
    return out


_ATOM = "{http://www.w3.org/2005/Atom}"


def _arxiv(client: httpx.Client, q: str, headers: dict) -> list[dict]:
    r = client.get("https://export.arxiv.org/api/query", headers=headers,
                   params={"search_query": "all:" + " AND all:".join(re.findall(r"[A-Za-z0-9\-]{3,}", q)[:6]), "max_results": PER_QUERY})
    r.raise_for_status()
    out = []
    for e in ET.fromstring(r.text).findall(_ATOM + "entry"):
        year = (e.findtext(_ATOM + "published") or "")[:4]
        p = _paper(e.findtext(_ATOM + "title"), [a.findtext(_ATOM + "name") for a in e.findall(_ATOM + "author")], int(year) if year.isdigit() else None,
                   "arXiv", e.findtext(_ATOM + "id"), "", e.findtext(_ATOM + "summary"), "arxiv")
        if p:
            out.append(p)
    return out


def _crossref(client: httpx.Client, q: str, headers: dict) -> list[dict]:
    r = client.get("https://api.crossref.org/works", headers=headers,
                   params={"query": q, "rows": PER_QUERY, "select": "title,DOI,issued,container-title,author,abstract,URL"})
    r.raise_for_status()
    out = []
    for w in r.json().get("message", {}).get("items", []):
        year = ((w.get("issued") or {}).get("date-parts") or [[None]])[0][0]
        p = _paper((w.get("title") or [""])[0], [f"{a.get('given', '')} {a.get('family', '')}".strip() for a in w.get("author", [])], year,
                   (w.get("container-title") or [""])[0], w.get("URL"), w.get("DOI"), w.get("abstract"), "crossref")
        if p:
            out.append(p)
    return out


PROVIDERS = (("openalex", _openalex), ("semanticscholar", _semanticscholar), ("arxiv", _arxiv), ("crossref", _crossref))


def _key(p: dict) -> str:
    return p["doi"].lower() or re.sub(r"\W+", "", p["title"].lower())


def search(queries: list[str], client: httpx.Client | None = None, timeout: float = 15.0) -> tuple[list[dict], list[str]]:
    """Return (candidate papers, names of the sources that answered). Never raises."""
    contact = os.environ.get("MINDTRACE_CONTACT_EMAIL", "")
    headers = {"User-Agent": "MindTrace/2.0 (research notes platform" + (f"; mailto:{contact}" if contact else "") + ")"}
    own = client is None
    client = client or httpx.Client(timeout=timeout, follow_redirects=True)
    seen: dict[str, dict] = {}
    answered: list[str] = []
    try:
        for name, fn in PROVIDERS:
            if len(seen) >= MAX_CANDIDATES:
                break
            ok = False
            for q in queries:
                try:
                    results = fn(client, q, headers)
                except (httpx.HTTPError, ET.ParseError, ValueError, KeyError, TypeError):
                    break                                            # this source is down or rate-limited: skip it, use the others
                ok = True
                for p in results:
                    seen.setdefault(_key(p), p)
            if ok:
                answered.append(SOURCE_NAMES[name])
    finally:
        if own:
            client.close()
    papers = sorted(seen.values(), key=lambda p: (not p["abstract"],))   # entries with an abstract first (stable: keeps provider order)
    return papers[:MAX_CANDIDATES], answered
