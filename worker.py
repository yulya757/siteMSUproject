import os
import time
import whisper
import sys
import json
import openai

# --- НАСТРОЙКИ ---
YANDEX_CLOUD_API_KEY = "AQVN1KBPdQw20sEAFZkeVaStBYMdOc40rCSnIT-t"
YANDEX_CLOUD_FOLDER = "b1g1dvtf1uq1af6af3ui"
YANDEX_CLOUD_MODEL = "deepseek-v3/latest" # или yandexgpt/latest

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
try:
    print("[*] Загрузка локальной модели Whisper 'base'...")
    model_whisper = whisper.load_model("base", device="cpu")
    print("[+] Whisper готов!")
except Exception as e:
    print(f"[!] Ошибка при старте Whisper: {e}")
    sys.exit()

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

def run_logic():
    if not os.path.exists(DATA_USERS_DIR):
        return

    # Загружаем промпт из database.txt (инструкции для ИИ)
    instructions = "Ты ассистент, анализирующий креативность."
    db_path = os.path.join(BASE_DIR, 'database.txt')
    if os.path.exists(db_path):
        with open(db_path, 'r', encoding="utf-8") as f:
            instructions = f.read()

    # Обходим всех юзеров и их сессии
    for root, dirs, files in os.walk(DATA_USERS_DIR):
        # 1. ТРАНСКРИБАЦИЯ (Whisper)
        for file in files:
            if file.endswith(".wav"):
                wav_path = os.path.join(root, file)
                txt_path = wav_path + ".txt" # Сохраняем как voice_1.wav.txt

                if not os.path.exists(txt_path):
                    print(f"\n[STT] Расшифровка аудио: {file}")
                    try:
                        result = model_whisper.transcribe(wav_path, language="ru")
                        with open(txt_path, "w", encoding="utf-8") as f:
                            f.write(result["text"].strip())
                        print(f"[OK] Голос переведен в текст.")
                    except Exception as e:
                        print(f"[!] Ошибка Whisper на файле {file}: {e}")

        # 2. АНАЛИЗ (AI)
        # Проверяем, есть ли в текущей папке answer.txt (это папка сессии)
        if 'answer.txt' in files:
            analysis_path = os.path.join(root, 'ai_analysis.json')
            
            if not os.path.exists(analysis_path):
                # Собираем данные для анализа
                full_text = ""
                
                # Текст из формы
                with open(os.path.join(root, 'answer.txt'), 'r', encoding='utf-8') as f:
                    full_text += f"Ответ пользователя: {f.read()}\n"
                
                # Добавляем расшифровки всех аудио из этой папки
                for f in os.listdir(root):
                    if f.endswith(".wav.txt"):
                        with open(os.path.join(root, f), 'r', encoding='utf-8') as af:
                            full_text += f"Голосовое дополнение: {af.read()}\n"

                # Отправляем в ИИ
                print(f"[*] Отправка данных сессии в {YANDEX_CLOUD_MODEL}...")
                ai_result = get_ai_analysis(instructions, full_text)
                
                if ai_result:
                    with open(analysis_path, 'w', encoding='utf-8') as f:
                        json.dump({"analysis": ai_result, "done": True}, f, ensure_ascii=False, indent=2)
                    print(f"[DONE] Анализ сохранен в {os.path.basename(root)}")

print(f"[*] Слежу за: {DATA_USERS_DIR}")
while True:
    try:
        run_logic()
    except Exception as e:
        print(f"[Критическая ошибка]: {e}")
    time.sleep(5)