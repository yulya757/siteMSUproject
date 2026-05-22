# Creativity Lab Website

This repository contains the code for the Creativity Lab website.

## Setup and Installation

To get this project up and running, follow these steps:

### 1. Install Node.js and npm

This project uses Node.js for the web server and npm (Node Package Manager) for managing JavaScript dependencies. If you don't have Node.js and npm installed, download them from the official website:
[https://nodejs.org/](https://nodejs.org/)

Verify installation by running in your terminal:
```bash
node -v
npm -v
```

### 2. Install Node.js Dependencies

Navigate to the project's root directory in your terminal and install the necessary Node.js packages:
```bash
npm install
```

### 3. Create and Activate Python Virtual Environment

This project uses Python for AI analysis and speech-to-text functionality. It's highly recommended to use a virtual environment to manage Python dependencies.

1.  **Create the virtual environment:**
    ```bash
    python -m venv venv
    ```

2.  **Activate the virtual environment:**
    *   **Windows (PowerShell/CMD):**
        ```bash
        .\venv\Scripts\activate
        ```
    *   **Linux/macOS:**
        ```bash
        source venv/bin/activate
        ```
    You should see `(venv)` at the beginning of your terminal prompt when activated.

### 4. Install Python Dependencies

With your virtual environment activated, install the required Python packages:
```bash
pip install openai-whisper openai
```


### 5. Running the Server

To start the web server, make sure you are in the project's root directory and run:
```bash
node server.js
```

The server will typically run on `http://localhost:3000` (or another port indicated in the console).

## AI Analysis Worker (`worker.py`)

The `worker.py` script is responsible for AI analysis of user sessions. It takes a `session_id` and `user_input_text` as command-line arguments. It performs speech-to-text (using Whisper) on `.wav` files in the session directory and then sends all collected text to Yandex Cloud AI for analysis. The result is saved in `ai_analysis.json` within the session directory.

**API Keys:**

Ensure that the following environment variables are set before running `worker.py` or `server.js` (if `server.js` will be spawning `worker.py`):

*   `YANDEX_CLOUD_API_KEY`
*   `YANDEX_CLOUD_FOLDER`
*   `YANDEX_CLOUD_MODEL`

Example of setting environment variables (for Windows CMD):
```bash
set YANDEX_CLOUD_API_KEY="YOUR_API_KEY"
set YANDEX_CLOUD_FOLDER="YOUR_FOLDER_ID"
set YANDEX_CLOUD_MODEL="deepseek-v3/latest"
```
(For PowerShell, use `$env:VARIABLE_NAME="value"`)

## Current Development Status

*   `worker.py` has been refactored to be run on demand with specific session data.
*   Integration with `server.js` and `public/js/test.js` is the next step.
