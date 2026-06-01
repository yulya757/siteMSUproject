import time
import json
import requests
import traceback
import boto3
import subprocess
import shutil
import os

# ==========================================
# НАСТРОЙКИ ЯНДЕКС ОБЛАКА
# ==========================================
API_KEY = os.environ.get("YANDEX_CLOUD_API_KEY", "") # Предполагаем, что этот ключ уже есть
FOLDER_ID = os.environ.get("YANDEX_CLOUD_FOLDER", "") # Предполагаем, что этот ID уже есть

# Настройки бакета
BUCKET_NAME = os.environ.get("YANDEX_STORAGE_BUCKET_NAME", "")
AWS_ACCESS_KEY = os.environ.get("YANDEX_STORAGE_ACCESS_KEY", "")
AWS_SECRET_KEY = os.environ.get("YANDEX_STORAGE_SECRET_KEY", "")


# ==========================================
# ПУТИ К ПАПКАМ
# ==========================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_USERS_DIR = os.path.join(BASE_DIR, 'data', 'users')

s3_client = boto3.client(
    's3',
    endpoint_url='https://storage.yandexcloud.net',
    aws_access_key_id=AWS_ACCESS_KEY,
    aws_secret_access_key=AWS_SECRET_KEY
)

auth_headers = {
    "Authorization": f"Api-key {API_KEY}",
    "x-folder-id": FOLDER_ID
}

def pretty_api_error(response):
    try: 
        return json.dumps(response.json(), ensure_ascii=False, indent=2)
    except Exception: 
        return response.text

def parse_stt_json(raw_json_text):
    try:
        # Используем словарь, чтобы избежать дубликатов по времени начала
        segments_map = {}
        
        for line in raw_json_text.strip().split('\n'):
            if not line.strip(): continue
            data = json.loads(line)
            res = data.get("result", {})
            
            # Приоритет: сначала ищем finalRefinement, если нет - то final
            content = res.get("finalRefinement") or res.get("final")
            if not content: continue
            
            # Достаем альтернативы
            # В finalRefinement путь -> normalizedText -> alternatives
            # В final путь -> alternatives
            alts = content.get("normalizedText", {}).get("alternatives") or content.get("alternatives", [])
            if not alts: continue
            
            words = alts[0].get("words", [])
            if not words: continue
            
            # Ключ - время начала, чтобы не дублировать
            start_ms = int(words[0].get("startTimeMs", 0))
            end_ms = int(words[-1].get("endTimeMs", 0))
            text = " ".join([w.get("text", "") for w in words])
            
            # Сохраняем в словарь (если это же время придет снова - оно перезапишется уточнением)
            segments_map[start_ms] = {
                "start": start_ms,
                "end": end_ms,
                "text": text
            }
            
        # Сортируем по времени и форматируем
        sorted_keys = sorted(segments_map.keys())
        output = []
        
        for key in sorted_keys:
            seg = segments_map[key]
            start_fmt = f"{seg['start'] // 60000:02d}:{(seg['start'] // 1000) % 60:02d}"
            end_fmt = f"{seg['end'] // 60000:02d}:{(seg['end'] // 1000) % 60:02d}"
            output.append(f"[{start_fmt} - {end_fmt}] - {seg['text']}")
            
        return "\n".join(output)
        
    except Exception as e:
        return f"Ошибка при парсинге JSON: {e}"

def process_audio(local_path, s3_key):
    temp_converted_path = None # Флаг для временного файла
    try:
        # 1. Сниффинг и возможная конвертация
        with open(local_path, 'rb') as f:
            magic = f.read(4)
        
        target_path = local_path # Файл, который будем грузить
        fmt = {}

        if magic.startswith(b'RIFF'):
            fmt = {"containerAudio": {"containerAudioType": "WAV"}}
        elif magic.startswith(b'OggS'):
            fmt = {"containerAudio": {"containerAudioType": "OGG_OPUS"}}
        elif magic.startswith(b'\x1a\x45\xdf\xa3'):
            print(f"[*] Обнаружен WebM. Запускаю конвертацию...")
            ffmpeg_path = shutil.which('ffmpeg')
            if not ffmpeg_path:
                print("[!] Ошибка: не найден исполняемый файл ffmpeg. Установите ffmpeg и добавьте его в PATH.")
                return "SKIP_UNSUPPORTED"

            temp_converted_path = local_path.replace('.wav', '_converted.wav')
            subprocess.run([
                ffmpeg_path, '-y', '-i', local_path,
                '-ar', '16000', '-ac', '1', '-vn', temp_converted_path
            ], check=True)
            target_path = temp_converted_path
            fmt = {"containerAudio": {"containerAudioType": "WAV"}}
        else:
            fmt = {"rawAudio": {"audioEncoding": "LINEAR16_PCM", "sampleRateHertz": 16000, "audioChannelCount": 1}}

        # 2. Загрузка в бакет (грузим target_path)
        print(f"[*] Загрузка {s3_key} в бакет {BUCKET_NAME}...")
        s3_client.upload_file(target_path, BUCKET_NAME, s3_key)
        
        # 3. Запуск распознавания
        resp = requests.post("https://stt.api.cloud.yandex.net/stt/v3/recognizeFileAsync",
            headers=auth_headers, json={"uri": f"https://storage.yandexcloud.net/{BUCKET_NAME}/{s3_key}", 
            "recognitionModel": {"model": "general", "audioFormat": fmt, "languageRestriction": {"languageCode": ["ru-RU"]}}}, verify=False)
        
        op_id = resp.json().get("id")
        
        # 4. Ожидание
        while True:
            time.sleep(5)
            op = requests.get(f"https://operation.api.cloud.yandex.net/operations/{op_id}", headers=auth_headers, verify=False).json()
            if op.get("done"): break
            
        res = requests.get(f"https://stt.api.cloud.yandex.net/stt/v3/getRecognition?operation_id={op_id}", headers=auth_headers, verify=False)
        return res.text

    except Exception as e:
        print(f"[!] Ошибка: {e}")
        return None
    finally:
        # Безопасное удаление из бакета
        try:
            s3_client.delete_object(Bucket=BUCKET_NAME, Key=s3_key)
        except: pass
        # Удаление временного файла конвертации
        if temp_converted_path and os.path.exists(temp_converted_path):
            os.remove(temp_converted_path)

def scan_and_transcribe():
    if not os.path.exists(DATA_USERS_DIR):
        return

    for root, dirs, files in os.walk(DATA_USERS_DIR):
        for file in files:
            if file.startswith("voice_") and file.endswith(".wav"):
                wav_path = os.path.join(root, file)
                txt_path = os.path.join(root, file.replace(".wav", ".txt"))

                if not os.path.exists(txt_path):
                    print(f"\n[+] Найдено новое аудио: {wav_path}")
                    
                    parts = os.path.normpath(wav_path).split(os.sep)
                    try:
                        file_name = parts[-1]       
                        session_id = parts[-2]      
                        username = parts[-4]        
                        s3_key = f"{username}_{session_id}_{file_name}"
                    except IndexError:
                        s3_key = f"unknown_{int(time.time())}_{file}"

                    raw_json = process_audio(wav_path, s3_key)
                    
                    if raw_json == "SKIP_UNSUPPORTED":
                        # Создаем пустой txt с предупреждением, чтобы скрипт заново не мучал этот файл
                        with open(txt_path, "w", encoding="utf-8") as f:
                            f.write("[ERROR] Фронтенд записал неподдерживаемый формат WebM.")
                        continue
                        
                    if raw_json:
                        final_text = parse_stt_json(raw_json)
                        with open(txt_path, "w", encoding="utf-8") as f:
                            f.write(final_text)
                        print(f"[DONE] Текст успешно сохранен: {txt_path}")

if __name__ == "__main__":
    print(f">>> Скрипт транскрибации запущен.")
    print(f"[*] Мониторинг директории: {DATA_USERS_DIR}")
    
    while True:
        try:
            scan_and_transcribe()
        except Exception:
            traceback.print_exc()
        time.sleep(5)