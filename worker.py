import os
import whisper
import sys
import json
import openai

# --- НАСТРОЙКИ ---
YANDEX_CLOUD_API_KEY = os.environ.get("YANDEX_CLOUD_API_KEY", "AQVN1KBPdQw20sEAFZkeVaStBYMdOc40rCSnIT-t") 
YANDEX_CLOUD_FOLDER = os.environ.get("YANDEX_CLOUD_FOLDER", "b1g1dvtf1uq1af6af3ui")
YANDEX_CLOUD_MODEL = os.environ.get("YANDEX_CLOUD_MODEL", "deepseek-v3/latest") # или yandexgpt/latest

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Путь к папке данных, которую создает твой Node.js сервер
DATA_USERS_DIR = os.path.join(BASE_DIR, 'data', 'users')

# Инициализация OpenAI клиента для Yandex Cloud
client = openai.OpenAI(
    api_key=YANDEX_CLOUD_API_KEY,
    base_url="https://ai.api.cloud.yandex.net/v1",
)

print(">>> ЗАПУСК СИСТЕМЫ CREATIVITY LAB (Whisper + AI Analysis)")

# Загрузка Whisper
model_whisper = None
try:
    print("[*] Загрузка локальной модели Whisper 'base'...")
    model_whisper = whisper.load_model("base", device="cpu")
    print("[+] Whisper готов!")
except Exception as e:
    print(f"[!] Ошибка при старте Whisper: {e}. Транскрибация аудио будет недоступна.")
    #sys.exit()

def get_ai_analysis(instructions, user_content):
    """Отправка накопленного текста в Yandex Cloud"""
    try:
        response = client.chat.completions.create(
            model=f"gpt://{YANDEX_CLOUD_FOLDER}/{YANDEX_CLOUD_MODEL}",
            messages=[
                {"role": "system", "content": instructions},
                {"role": "user", "content": user_content}
            ],
            temperature=0.3
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"[!] Ошибка AI: {e}")
        return None

def analyze_session(session_id, user_input_text):
    """Основная функция анализа сессии"""

    session_path = os.path.join(DATA_USERS_DIR, session_id)
    if not os.path.exists(session_path):
        print(f"[!] Сессия {session_id} не найдена для анализа.")
        return "[!] Сессия не найдена."
    
    # Промт для ИИ
    instructions = "Ты - ассистент для анализа креативности."
    db_path = os.path.join(BASE_DIR, "database.txt")
    if os.path.exists(db_path):
        with open(db_path, "r", encoding="utf-8") as f:
            instructions = f.read()

    full_text = f"Ответ пользователя: {user_input_text}"

    #Добавляем расшифровки всех аудио из этой папки (если whisper загрузился)
    if model_whisper:
        for f in os.listdir(session_path):
            if f.endswith(".wav"):
                wav_path = os.path.join(session_path, f)
                txt_path = wav_path + ".txt"

                if not os.path.exists(txt_path):
                    print(f"[*] Расшифровка {f}...")
                    try:
                        result = model_whisper.transcribe(wav_path, language="ru")
                        with open(txt_path, "w", encoding="utf-8") as wf:
                            wf.write(result["text"].strip())
                        print(f"[+] Расшифровка {f} сохранена.")
                    except Exception as e:
                        print(f"[!] Ошибка при расшифровке {f}: {e}")
                
            if f.endswith(".wav.txt"):
                with open(os.path.join(session_path, f), "r", encoding="utf-8") as af:
                    full_text += f"Голосовое дополнение: {af.read()}\n"

    # Отправляем все в Yandex Cloud для анализа
    print("[*] Отправляем данные в Yandex Cloud для анализа...")
    ai_result = get_ai_analysis(instructions, full_text)

    if ai_result:
        analysis_file_path = os.path.join(session_path, "ai_analysis.json")
        with open(analysis_file_path, "w", encoding="utf-8") as f:
            json.dump({"analysis": ai_result, "done": True}, f, ensure_ascii=False, indent=2)
        print(f"[+] Анализ для сессии {session_id} сохранен.")
        return ai_result
    return "[!] Ошибка при получении анализа от Yandex Cloud."


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Использование: python worker.py <session_id> <user_input_text>")
        sys.exit(1)

    session_id = sys.argv[1]
    user_input_text = sys.argv[2]
    result = analyze_session(session_id, user_input_text)
    print(result)
    

