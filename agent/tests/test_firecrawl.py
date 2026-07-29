"""Quick smoke-test: hit a live URL with Firecrawl via the shared scraper."""
from scraper import _scrape_firecrawl_single

result = _scrape_firecrawl_single("https://example.com")
if result:
    print(result[:100])
else:
    print("Firecrawl returned no content (check FIRECRAWL_API_KEY in Infisical).")
