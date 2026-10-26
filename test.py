from tools.tavily_tool import tavily_search
from tools.flight_tool import search_flights

# res = tavily_search("Best Hotels in Nepal")
# print(res)

res = search_flights("plan a 7 days pokhara plan from newyork")
print(res)

