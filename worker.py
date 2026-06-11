import sys
import json
import requests
import boto3
import subprocess
import os
import time
import urllib3
import openai

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ==========================================
# НАСТРОЙКИ ЯНДЕКС ОБЛАКА
# ==========================================
API_KEY = "AQVN0mjyvg5mAKfId6ZhU-ae6lXllOnj9aX65yon"
FOLDER_ID = "b1g1dvtf1uq1af6af3ui"

# 100% рабочий вариант для Yandex Cloud через библиотеку OpenAI
YANDEX_CLOUD_MODEL = "yandexgpt/latest" 

BUCKET_NAME = "msu-project-creaai-sessions"
AWS_ACCESS_KEY = "YCAJEeZo_9m2TwB4_YkQfeCh9"
AWS_SECRET_KEY = "YCNj5WJh6nKhoSpw-U_RnM8JaYIxdwTyrDw_cIes"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_PATH = os.path.join(BASE_DIR, 'database.txt')

s3_client = boto3.client('s3', endpoint_url='https://storage.yandexcloud.net', aws_access_key_id=AWS_ACCESS_KEY, aws_secret_access_key=AWS_SECRET_KEY)
auth_headers = {"Authorization": f"Api-key {API_KEY}", "x-folder-id": FOLDER_ID}
ai_client = openai.OpenAI(api_key=API_KEY, base_url="https://ai.api.cloud.yandex.net/v1")

# ==========================================
# Хелперы для работы с метаданными анализа сессий (Python)
# ==========================================
def get_analysis_meta_path(session_dir):
    return os.path.join(session_dir, "analysis_meta.json")

def save_analysis_meta(session_dir, meta):
    meta_path = get_analysis_meta_path(session_dir)
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

def load_analysis_meta(session_dir):
    meta_path = get_analysis_meta_path(session_dir)
    if os.path.exists(meta_path):
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[!] Ошибка чтения analysis_meta.json для {session_dir}: {e}")
            return None
    return None

# ==========================================
# ФУНКЦИИ ТРАНСКРИБАЦИИ
# ==========================================
def parse_stt_json(raw_json_text):
    try:
        segments_map = {}
        for line in raw_json_text.strip().split('\n'):
            if not line.strip(): continue
            data = json.loads(line)
            res = data.get("result", {})
            content = res.get("finalRefinement") or res.get("final")
            if not content: continue
            alts = content.get("normalizedText", {}).get("alternatives") or content.get("alternatives", [])
            if not alts: continue
            words = alts[0].get("words", [])
            if not words: continue
            
            start_ms = int(words[0].get("startTimeMs", 0))
            end_ms = int(words[-1].get("endTimeMs", 0))
            text = " ".join([w.get("text", "") for w in words])
            segments_map[start_ms] = {"start": start_ms, "end": end_ms, "text": text}
            
        output = []
        for key in sorted(segments_map.keys()):
            seg = segments_map[key]
            start_fmt = f"{seg['start'] // 60000:02d}:{(seg['start'] // 1000) % 60:02d}"
            end_fmt = f"{seg['end'] // 60000:02d}:{(seg['end'] // 1000) % 60:02d}"
            output.append(f"[{start_fmt} - {end_fmt}] - {seg['text']}")
        return "\n".join(output)
    except Exception as e:
        return f"Ошибка при парсинге: {e}"

def process_audio(local_path, s3_key):
    temp_converted_path = None
    try:
        with open(local_path, 'rb') as f: magic = f.read(4)
        target_path, fmt = local_path, {}

        if magic.startswith(b'RIFF'): fmt = {"containerAudio": {"containerAudioType": "WAV"}}
        elif magic.startswith(b'OggS'): fmt = {"containerAudio": {"containerAudioType": "OGG_OPUS"}}
        elif magic.startswith(b'\x1a\x45\xdf\xa3'):
            temp_converted_path = local_path.replace('.wav', '_converted.wav')
            subprocess.run(['ffmpeg', '-y', '-i', local_path, '-ar', '16000', '-ac', '1', '-vn', temp_converted_path], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            target_path, fmt = temp_converted_path, {"containerAudio": {"containerAudioType": "WAV"}}
        else: fmt = {"rawAudio": {"audioEncoding": "LINEAR16_PCM", "sampleRateHertz": 16000, "audioChannelCount": 1}}

        s3_client.upload_file(target_path, BUCKET_NAME, s3_key)
        resp = requests.post("https://stt.api.cloud.yandex.net/stt/v3/recognizeFileAsync",
            headers=auth_headers, json={"uri": f"https://storage.yandexcloud.net/{BUCKET_NAME}/{s3_key}", 
            "recognitionModel": {"model": "general", "audioFormat": fmt, "languageRestriction": {"languageCode": ["ru-RU"]}}}, verify=False)
        
        op_id = resp.json().get("id")
        while True:
            time.sleep(3)
            op = requests.get(f"https://operation.api.cloud.yandex.net/operations/{op_id}", headers=auth_headers, verify=False).json()
            if op.get("done"): break
            
        res = requests.get(f"https://stt.api.cloud.yandex.net/stt/v3/getRecognition?operation_id={op_id}", headers=auth_headers, verify=False)
        return res.text

    except Exception as e:
        print(f"[!] Ошибка аудио {s3_key}: {e}")
        return None
    finally:
        try: s3_client.delete_object(Bucket=BUCKET_NAME, Key=s3_key)
        except: pass
        if temp_converted_path and os.path.exists(temp_converted_path): os.remove(temp_converted_path)

# ==========================================
# ОСНОВНАЯ ЛОГИКА (ОДИН ПРОГОН)
# ==========================================
def run_session_pipeline(session_path):
    print(f"[*] Старт обработки сессии: {session_path}")
    
    meta = load_analysis_meta(session_path)
    if not meta:
        meta = {
             'status': 'processing',
             'queuedAt': int(time.time() * 1000), # Используем текущее время как заглушку
             'lastAttemptAt': int(time.time() * 1000),
             'retryCount': 0,
             'lastError': None
        }
    else:
        meta["status"] = "processing"
        meta["lastAttemptAt"] = int(time.time() * 1000)
        meta["retryCount"] = meta.get("retryCount", 0) + 1
        meta["lastError"] = None
    save_analysis_meta(session_path, meta)
    print(f"[МЕТАДАННЫЕ] Статус сессии обновлен на: {meta['status']}")

    if not os.path.exists(session_path):
        print("[!] Ошибка: Папка сессии не найдена.")
        meta["status"] = "error"
        meta["lastError"] = "Папка сессии не найдена worker.py."
        save_analysis_meta(session_path, meta)
        sys.exit(1)

    try:
        # 1. ТРАНСКРИБАЦИЯ ВСЕХ АУДИО
        audio_files = [f for f in os.listdir(session_path) if f.startswith("voice_") and f.endswith(".wav")]
        for file in audio_files:
            wav_path = os.path.join(session_path, file)
            txt_path = os.path.join(session_path, file.replace(".wav", ".txt"))
            
            if not os.path.exists(txt_path):
                print(f"[*] Транскрибация файла: {file}...")
                s3_key = f"temp_{int(time.time())}_{file}"
                raw_json = process_audio(wav_path, s3_key)
                
                with open(txt_path, "w", encoding="utf-8") as f:
                    if raw_json == "SKIP_UNSUPPORTED": f.write("[ERROR] Неподдерживаемый формат.")
                    elif raw_json: f.write(parse_stt_json(raw_json))
                    else: f.write("[ERROR] Ошибка распознавания.")

        # ==========================================
        # 2. СБОРКА ДАННЫХ ДЛЯ AI
        # ==========================================
        print("[*] Сборка данных для AI анализа...")
        instructions = "Ты - ассистент для анализа креативности."
        if os.path.exists(DATABASE_PATH):
            with open(DATABASE_PATH, "r", encoding="utf-8") as f: instructions = f.read()

        full_text = ""
        
        # --- ДОБАВЛЕНО: Чтение текста задачи ---
        task_path = os.path.join(session_path, "task_text.txt")
        if os.path.exists(task_path):
            with open(task_path, "r", encoding="utf-8") as f:
                full_text += f"--- КОНТЕКСТ (ЗАДАНИЕ К ВЫПОЛНЕНИЮ) ---\n{f.read()}\n\n"
        # --------------------------------------

        answer_path = os.path.join(session_path, "answer.txt")
        if os.path.exists(answer_path):
            with open(answer_path, "r", encoding="utf-8") as f: full_text += f"Текстовый ответ пользователя:\n{f.read()}\n\n"
        
        full_text += "Голосовые пояснения пользователя:\n"
        for file in os.listdir(session_path):
            if file.startswith("voice_") and file.endswith(".txt"):
                with open(os.path.join(session_path, file), "r", encoding="utf-8") as af:
                    full_text += f"--- {file} ---\n{af.read()}\n"

        # 3. ОТПРАВКА В AI И СОХРАНЕНИЕ
        print("[*] Отправка в YandexGPT...")
        
        response = ai_client.chat.completions.create(
            model=f"gpt://{FOLDER_ID}/{YANDEX_CLOUD_MODEL}",
            messages=[
                {"role": "system", "content": instructions},
                {"role": "user", "content": full_text}
            ],
            temperature=0.3
        )
        ai_result = response.choices[0].message.content
        
        analysis_file_path = os.path.join(session_path, "ai_analysis.json")
        with open(analysis_file_path, "w", encoding="utf-8") as f:
            json.dump({"analysis": ai_result, "done": True}, f, ensure_ascii=False, indent=2)
        print(f"[+] Анализ успешно завершен и сохранен!")

        meta["status"] = "done"
        meta["lastError"] = None
        save_analysis_meta(session_path, meta)
        print(f"[МЕТАДАННЫЕ] Статус сессии обновлен на: {meta['status']}")
        
    except Exception as e:
        print(f"[!] КРИТИЧЕСКАЯ ОШИБКА AI анализа или транскрибации: {e}")
        meta['status'] = 'error'
        meta['lastError'] = str(e) # Сохраняем текст ошибки
        save_analysis_meta(session_path, meta)
        print(f"[МЕТАДАННЫЕ] Статус сессии обновлен на: {meta['status']}, ОШИБКА: {meta['lastError']}")
        

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Использование: python worker.py <полный_путь_к_папке_сессии>")
        sys.exit(1)
        
    target_session_path = sys.argv[1]
    run_session_pipeline(target_session_path)