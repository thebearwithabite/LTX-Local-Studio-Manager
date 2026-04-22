import { spawn, ChildProcess } from "child_process";
import path from "path";

let daemonProcess: ChildProcess | null = null;

export function startDaemon() {
    if (daemonProcess) {
        return { success: false, message: "Daemon is already running." };
    }

    const workspaceRoot = "/Users/ryanthomson/Github/LTX-Local-Studio-Manager";
    const scriptPath = path.join(workspaceRoot, "services/training-collector/aesthetic_scorer.py");

    console.log(`[DAEMON] Starting aesthetic scorer: ${scriptPath}`);
    
    // Use unbuffered output for Python
    daemonProcess = spawn("python3", ["-u", scriptPath], {
        cwd: path.dirname(scriptPath),
        env: { ...process.env, PYTHONUNBUFFERED: "1" }
    });

    daemonProcess.stdout?.on("data", (data) => {
        console.log(`[SCORER] ${data.toString().trim()}`);
    });

    daemonProcess.stderr?.on("data", (data) => {
        console.error(`[SCORER-ERROR] ${data.toString().trim()}`);
    });

    daemonProcess.on("close", (code) => {
        console.log(`[DAEMON] Process exited with code ${code}`);
        daemonProcess = null;
    });

    return { success: true, message: "Daemon started successfully." };
}

export function stopDaemon() {
    if (!daemonProcess) {
        return { success: false, message: "No daemon process found." };
    }

    console.log("[DAEMON] Stopping aesthetic scorer...");
    daemonProcess.kill("SIGTERM");
    daemonProcess = null;
    return { success: true, message: "Daemon stopped successfully." };
}

export function getDaemonStatus() {
    return { 
        running: !!daemonProcess,
        pid: daemonProcess?.pid
    };
}
