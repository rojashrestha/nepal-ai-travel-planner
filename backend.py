import os 
import certifi 
from dotenv import load_dotenv 

load_dotenv()

os.environ["SSL_CERT_FILE"] = certifi.where()
os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()

from typing  import TypedDict, Annotated
import operator
import re
import uuid
import psycopg
from psycopg.rows import dict_row

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.postgres import PostgresSaver
from langchain_core.messages import (
    AnyMessage,
    HumanMessage,
    AIMessage,
    SystemMessage,
)

from langchain_groq import ChatGroq
from tools.tavily_tool import tavily_search
from tools.flight_tool import search_flights


def get_database_url():
    database_url =os.getenv("DATABASE_URL")

    if not database_url:
        raise ValueError(
            "DATABASE_URL is missing. Please add ypur Render PostgreSQL External Database URL to .env"
        )

    if "sslmode=" not in database_url:
        separator = "&" if "?" in database_url else "?"
        database_url = f"{database_url}{separator}sslmode=require"

    return database_url



GROQ_API_KEY = os.getenv('GROQ_API_KEY')
if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY is missing. Please add it to your .env file")

# =============================
# llm
# =============================

# llama-prompt-guard models are safety classifiers with a 512-token limit,
# not chat models, so use a general chat model with a large context window
llm = ChatGroq(
    model=os.getenv("GROQ_MODEL", "openai/gpt-oss-120b"),
    api_key=GROQ_API_KEY
)


NEPAL_PLANNER_PROMPT = """You are an expert Nepal travel planner.
- Plan trips within Nepal, or to Nepal from abroad.
- Use Nepali Rupees (NPR / Rs.) for all prices unless the user names another currency.
  Treat budgets like "20 thousand" as NPR 20,000.
- Prefer the transport Nepalis actually use: tourist buses, local buses, micro buses,
  shared jeeps, taxis, and domestic flights only when asked or clearly worth it.
- If a place name looks misspelled (e.g. "Tahanun" for Tanahun), use the closest
  Nepali place and say which one you assumed.
- Use the search results when they are relevant. Label prices as estimates and
  never invent exact bus schedules or hotel prices as facts.
- Stay within the user's budget and show a cost breakdown."""


class TravelState(TypedDict):
    messages: Annotated[list[AnyMessage], operator.add]
    user_query: str
    transport_results: str
    hotel_results: str
    itinerary: str
    llm_calls: int


# =========================
# Transport Agent
# =========================

FLIGHT_WORDS = re.compile(r"\b(flight|flights|fly|flying|airfare|plane)\b", re.IGNORECASE)


def transport_agent(state: TravelState):
    query = state["user_query"]

    # Road travel within Nepal: search for bus/jeep fares
    transport_data = tavily_search(f"Nepal bus fare and travel time in NPR for: {query}")

    # Only call the flight API when the user actually asks about flights
    if FLIGHT_WORDS.search(query):
        transport_data += "\n\nFlight Data:\n" + search_flights(query)

    return {
        "transport_results": transport_data,
        "messages": [
            AIMessage(content="Transport information fetched.")
        ],
        "llm_calls": state.get("llm_calls", 0)
    }


# =========================
# Hotel Agent
# =========================

def hotel_agent(state: TravelState):
    query = f"Hotels in Nepal with prices in NPR for: {state['user_query']}"
    hotel_results = tavily_search(query)

    return {
        "hotel_results": hotel_results,
        "messages": [
            AIMessage(content="Hotel information fetched.")
        ],
        "llm_calls": state.get("llm_calls", 0)
    }

def itinerary_agent(state: TravelState):
    prompt = f"""
Create a complete travel itinerary.

User Query:
{state['user_query']}

Transport Results:
{state['transport_results']}

Hotel Results:
{state['hotel_results']}

Make the itinerary practical, budget-aware, and easy to follow.
Include sightseeing and activities with typical entry fees where relevant.
"""

    response = llm.invoke([
        SystemMessage(content=NEPAL_PLANNER_PROMPT),
        HumanMessage(content=prompt)
    ])

    return {
        "itinerary": response.content,
        "messages": [response],
        "llm_calls": state.get("llm_calls", 0) + 1
    }

def final_agent(state: TravelState):
    final_prompt = f"""
Generate the final travel response for the user.

User Request:
{state['user_query']}

Transport:
{state['transport_results']}

Hotels:
{state['hotel_results']}

Itinerary:
{state['itinerary']}

Format the final answer beautifully using these sections:

1. Trip Summary
2. Transport (how to get there and get around, with fares)
3. Hotel Suggestions
4. Day-by-Day Itinerary
5. Estimated Budget (NPR breakdown and total vs. the user's budget)
6. Final Recommendations

Important:
- Be clear and practical.
- If flight data is included, mention that the live flight API does not provide ticket prices.
- Keep the response useful for real travel planning.
"""

    response = llm.invoke([
        SystemMessage(content=NEPAL_PLANNER_PROMPT),
        HumanMessage(content=final_prompt)
    ])

    return {
        "messages": [response],
        "llm_calls": state.get("llm_calls", 0) + 1
    }


# =========================
# Build Graph
# =========================

graph = StateGraph(TravelState)

graph.add_node("transport_agent", transport_agent)
graph.add_node("hotel_agent", hotel_agent)
graph.add_node("itinerary_agent", itinerary_agent)
graph.add_node("final_agent", final_agent)

graph.add_edge(START, "transport_agent")
graph.add_edge("transport_agent", "hotel_agent")
graph.add_edge("hotel_agent", "itinerary_agent")
graph.add_edge("itinerary_agent", "final_agent")
graph.add_edge("final_agent", END)


# =========================
# PostgreSQL Checkpointer
# =========================
DATABASE_URL = get_database_url()

_conn = psycopg.connect(
    DATABASE_URL,
    autocommit=True,
    row_factory=dict_row
)

checkpointer = PostgresSaver(_conn)
checkpointer.setup()

travel_graph = graph.compile(checkpointer=checkpointer)



# =========================
# Function for FastAPI
# =========================

def run_travel_agent(user_input: str, thread_id: str | None = None):
    if not thread_id:
        thread_id = f"user_{uuid.uuid4().hex}"

    config = {
        "configurable": {
            "thread_id": thread_id
        }
    }

    result = travel_graph.invoke(
        {
            "messages": [
                HumanMessage(content=user_input)
            ],
            "user_query": user_input,
            "transport_results": "",
            "hotel_results": "",
            "itinerary": "",
            "llm_calls": 0
        },
        config=config
    )

    final_answer = result["messages"][-1].content

    return {
        "thread_id": thread_id,
        "answer": final_answer,
        "transport_results": result.get("transport_results", ""),
        "hotel_results": result.get("hotel_results", ""),
        "itinerary": result.get("itinerary", ""),
        "llm_calls": result.get("llm_calls", 0),
    }
