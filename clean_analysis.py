import os
import glob

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_USERS_DIR = os.path.join(BASE_DIR, 'data', 'users')

def clean_analysis_results():
    if not os.path.exists(DATA_USERS_DIR):
        print(f"[!] Папка {DATA_USERS_DIR} не найдена. Нет данных для очистки.")
        return

    print(f"[*] Начинаем очистку результатов анализа в {DATA_USERS_DIR}...")
    deleted_count = 0

    for root, dirs, files in os.walk(DATA_USERS_DIR):
        # Удаляем ai_analysis.json
        if 'ai_analysis.json' in files:
            path_to_delete = os.path.join(root, 'ai_analysis.json')
            os.remove(path_to_delete)
            print(f"[DELETED] {path_to_delete}")
            deleted_count += 1
        
        # Удаляем *.wav.txt файлы
        for f in glob.glob(os.path.join(root, '*.wav.txt')):
            os.remove(f)
            print(f"[DELETED] {f}")
            deleted_count += 1
            
    if deleted_count == 0:
        print("[INFO] Нет файлов для очистки.")
    else:
        print(f"[DONE] Очищено {deleted_count} файлов.")

if __name__ == "__main__":
    clean_analysis_results()