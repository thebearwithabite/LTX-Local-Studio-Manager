import subprocess
import os
import signal
import sys
import threading
import time
from dotenv import load_dotenv

# ANSI Colors for logging
BLUE = "\033[94m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
RESET = "\033[0m"
BOLD = "\033[1m"

def log(prefix, message, color=RESET):
    try:
        # Some terminals on Windows need careful handling of unicode
        print(f"{color}{BOLD}[{prefix}]{RESET} {message}")
    except UnicodeEncodeError:
        # Fallback for environments that can't handle the unicode characters
        clean_message = message.encode('ascii', 'ignore').decode('ascii')
        print(f"{color}{BOLD}[{prefix}]{RESET} {clean_message}")

def check_env():
    log("SYSTEM", "Loading .env and verifying configurations...")
    load_dotenv()
    db_port = os.getenv("DB_PORT")
    if db_port != "5433":
        log("ERROR", f"CRITICAL: DB_PORT is set to '{db_port}', but MUST be '5433'. Check your .env file.", RED)
        sys.exit(1)
    
    project_root = os.getenv("PROJECT_ROOT_PATH")
    if not project_root:
         log("WARNING", "PROJECT_ROOT_PATH not found in .env. Falling back to default.", YELLOW)
    
    log("SYSTEM", "Environment verification passed.", GREEN)

def clean_ports(ports):
    log("SYSTEM", f"Cleaning up ports: {', '.join(map(str, ports))}...")
    for port in ports:
        try:
            # On Windows, use netstat to find PIDs
            output = subprocess.check_output(f"netstat -ano | findstr :{port}", shell=True).decode()
            pids = set()
            for line in output.strip().split("\n"):
                parts = line.split()
                if len(parts) > 4:
                    pid = parts[-1]
                    pids.add(pid)
            
            for pid in pids:
                log("SYSTEM", f"Killing process {pid} on port {port}...")
                subprocess.run(f"taskkill /F /PID {pid}", shell=True, capture_output=True)
        except subprocess.CalledProcessError:
            # findstr returns exit code 1 if no matches found
            pass
    log("SYSTEM", "Port management completed.", GREEN)

def stream_logs(process, prefix, color):
    for line in iter(process.stdout.readline, b''):
        msg = line.decode().strip()
        if msg:
            log(prefix, msg, color)

def run():
    check_env()
    clean_ports([5173, 8000])

    log("SYSTEM", "Starting UI and API services...", BOLD)

    # UI Process (Vite)
    ui_cmd = ["node_modules\\.bin\\vite.cmd"]
    ui_proc = subprocess.Popen(ui_cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)

    # API Process (Python FastAPI)
    api_cmd = ["execution\\venv\\Scripts\\python.exe", "execution\\api.py"]
    api_proc = subprocess.Popen(api_cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)

    # Threads for consolidated logging
    ui_thread = threading.Thread(target=stream_logs, args=(ui_proc, "UI", BLUE), daemon=True)
    api_thread = threading.Thread(target=stream_logs, args=(api_proc, "API", GREEN), daemon=True)

    ui_thread.start()
    api_thread.start()

    log("SYSTEM", "Control Tower Online. Hit Ctrl+C to shutdown.", YELLOW)

    try:
        while True:
            time.sleep(1)
            if ui_proc.poll() is not None:
                log("SYSTEM", "UI process exited unexpectedly.", RED)
                break
            if api_proc.poll() is not None:
                log("SYSTEM", "API process exited unexpectedly.", RED)
                break
    except KeyboardInterrupt:
        log("SYSTEM", "\nShutdown signal received. Cleaing up processes...", YELLOW)
    finally:
        ui_proc.terminate()
        api_proc.terminate()
        log("SYSTEM", "All processes stopped. Goodbye.", BOLD)

if __name__ == "__main__":
    # Force output to flush immediately for better terminal visibility
    print(">>> Dev Supervisor Initializing...")
    # Ensure ANSI colors work on Windows 10+
    if os.name == 'nt':
        os.system('color')
    run()
