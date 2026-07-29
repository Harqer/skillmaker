"""Quick smoke-test: hit a live URL with the scraper pipeline."""
from scraper import scrape_docs

result = scrape_docs("https://example.com")
if result and not result.startswith("[scraper] Failed"):
    print(result[:200])
else:
    print("Scraper returned no content (check API keys in Infisical).")
