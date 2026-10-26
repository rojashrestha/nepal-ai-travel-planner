from tavily import TavilyClient
import os
import re
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("TAVILY_API_KEY")
client = TavilyClient(api_key=API_KEY) if API_KEY else None


def clean_snippet(text):
    # strip markdown markers (#, >, *, -) and drop repeated lines
    lines = []
    for line in text.splitlines():
        line = re.sub(r"^[#>*\-\s]+", "", line).strip()
        if line and line not in lines:
            lines.append(line)
    return " · ".join(lines)


def tavily_search(query):
    if client is None:
        return (
            "Tavily API error: TAVILY_API_KEY is missing.\n"
            "Please add this in your .env file:\n"
            "TAVILY_API_KEY=your_api_key_here"
        )

    try:
        response = client.search(query=query, max_results=5)
    except Exception as e:
        return f"Tavily search failed: {e}"

    results = []

    for i, r in enumerate(response.get('results', []), 1):
        title = r.get('title', 'unknown')
        url = r.get('url', '')
        snippet = clean_snippet(r.get('content', ''))

        # keep only the first 300 characters to avoid wall-of-text
        if len(snippet) > 300:
            snippet = snippet[:300].rsplit(" ", 1)[0] + "..."

        results.append(f'{i}. {title}\nURL: {url}\nSnippet: {snippet}')

    if not results:
        return f"No search results found for: {query}"

    return "\n\n".join(results)
