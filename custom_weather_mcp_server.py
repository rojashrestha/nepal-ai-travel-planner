import logging
import os

import httpx
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

load_dotenv()

OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY")
BASE_URL = "https://api.openweathermap.org/data/2.5"

mcp = FastMCP("weather")

# httpx logs full request URLs, which include the API key
logging.getLogger("httpx").setLevel(logging.WARNING)


async def _fetch(endpoint: str, city: str) -> dict:
    if not OPENWEATHER_API_KEY:
        raise RuntimeError("OPENWEATHER_API_KEY is not set")

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(
            f"{BASE_URL}/{endpoint}",
            params={
                "q": city,
                "appid": OPENWEATHER_API_KEY,
                "units": "metric"
            }
        )
        response.raise_for_status()
        return response.json()


@mcp.tool()
async def get_current_weather(city: str) -> str:
    """Get the current weather for a city."""
    data = await _fetch("weather", city)

    return (
        f"Weather in {data['name']}, {data['sys']['country']}: "
        f"{data['weather'][0]['description']}, "
        f"{data['main']['temp']}°C "
        f"(feels like {data['main']['feels_like']}°C, "
        f"humidity {data['main']['humidity']}%, "
        f"wind {data['wind']['speed']} m/s"
    )


@mcp.tool()
async def get_forecast(city: str) -> str:
    """Get a 5-day weather forecast for a city."""
    data = await _fetch("forecast", city)

    lines = [f"5-day forecast for {data['city']['name']}:"]

    for item in data["list"]:
        # The API returns 3-hour steps; keep the
        if item["dt_txt"].endswith("12:00:00"):
            lines.append(
                f"{item['dt_txt'][:10]}: "
                f"{item['weather'][0]['description']}, "
                f"{item['main']['temp']}°C, "
                f"humidity {item['main']['humidity']}%"
            )

    return "\n".join(lines)


if __name__ == "__main__":
    # stdio transport: never print() to stdout here, it breaks the MCP protocol
    mcp.run(transport="stdio")