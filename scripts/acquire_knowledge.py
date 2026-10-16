"""Refresh a reviewed CC0 glossary from pinned Wikidata entities.
Search names were manually reviewed: album/band/name collisions were excluded.
Run from the repository root. Failure never overwrites the checked-in dataset.
"""
import datetime
import hashlib
import json
from pathlib import Path
import urllib.parse
import urllib.request

ENTITIES = {
    "Q119565": "frame rate", "Q12538706": "display resolution",
    "Q1330119": "non-linear editing", "Q1441762": "aspect ratio",
    "Q166863": "color space", "Q1937950": "sound design",
    "Q202866": "animated film", "Q204028": "subtitle", "Q212633": "H.264",
    "Q2141393": "match cut", "Q237893": "film editing", "Q240831": "video codec",
    "Q309440": "WebM", "Q334667": "storyboard", "Q744083": "jump cut",
}

if __name__ == "__main__":
    query = urllib.parse.urlencode({"action": "wbgetentities", "ids": "|".join(ENTITIES), "props": "labels|descriptions|info", "languages": "en", "format": "json"})
    url = "https://www.wikidata.org/w/api.php?" + query
    request = urllib.request.Request(url, headers={"User-Agent": "KRIYA-knowledge/0.1 (https://github.com/Maksmit0611/KRIYA)", "Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=30) as response:
        raw = response.read(1_000_000)
    data = json.loads(raw)["entities"]
    records = []
    for entity_id, term in ENTITIES.items():
        entity = data[entity_id]
        records.append({"id": "wikidata-" + entity_id, "title": entity["labels"]["en"]["value"], "category": "glossary", "tags": [term], "body": entity["descriptions"]["en"]["value"], "sourceUrl": "https://www.wikidata.org/wiki/" + entity_id, "license": "CC0-1.0", "retrievedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "sourceRevision": entity["lastrevid"], "sourceSha256": hashlib.sha256(raw).hexdigest(), "acquisitionUrl": url, "reviewStatus": "reviewed-entity-match"})
    output = {"schemaVersion": "1.0.0", "license": "CC0-1.0", "licenseUrl": "https://www.wikidata.org/wiki/Wikidata:Licensing", "records": records}
    target = Path("data/knowledge/wikidata.json")
    temp = target.with_suffix(".tmp")
    temp.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n")
    temp.replace(target)
    print(f"Acquired {len(records)} CC0 glossary records from reviewed entity IDs.")
