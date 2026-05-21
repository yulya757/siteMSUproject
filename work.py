import openai
import os

session = "s_1776341885482_task5"
s = ""
user_input = ""

with open('database.txt', 'r', encoding="utf-8") as f:
    for line in f.readlines():
        s += line
with open(os.path.join('./sessions', session, 'voice_1.txt') 'r', encoding="utf-8") as f:
    for line in f.readlines():
        user_input += line

YANDEX_CLOUD_FOLDER = "b1g1dvtf1uq1af6af3ui"
YANDEX_CLOUD_API_KEY = "AQVN1KBPdQw20sEAFZkeVaStBYMdOc40rCSnIT-t"
YANDEX_CLOUD_MODEL = "deepseek-v32/latest"

client = openai.OpenAI(
  api_key=YANDEX_CLOUD_API_KEY,
  base_url="https://ai.api.cloud.yandex.net/v1",
  project=YANDEX_CLOUD_FOLDER
)

response = client.responses.create(
  model=f"gpt://{YANDEX_CLOUD_FOLDER}/{YANDEX_CLOUD_MODEL}",
  temperature=0.3,
  instructions=s,
  input=user_input,
  max_output_tokens=500
)

print(response.output_text)