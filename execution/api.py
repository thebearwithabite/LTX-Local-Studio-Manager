from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
import db_manager
from generate_keyframe import run_pipeline
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PROJECT_ROOT_PATH = os.getenv("PROJECT_ROOT_PATH", r"C:\Users\thebe\Downloads\Ltx Desktop Assets")

class ProjectInput(BaseModel):
    id: str
    name: str
    local_path: Optional[str] = None

class ShotInput(BaseModel):
    id: str
    project_id: str
    pitch: Optional[str] = None
    status: str
    veo_json_blob: Optional[Dict[str, Any]] = None

class AssetInput(BaseModel):
    id: str
    shot_id: str
    type: str  # 'keyframe' or 'video'
    local_path: Optional[str] = None

class KeyframeRequest(BaseModel):
    shot_id: str
    project_id: str
    prompt: str
    model_type: str  # 'character', 'architecture', 'mood', 'interior'
    char_ref_path: Optional[str] = None
    loc_ref_path: Optional[str] = None

@app.get("/scan")
def scan_directory():
    """Scans the designated root folder for project subdirectories."""
    projects = []
    if os.path.exists(PROJECT_ROOT_PATH):
        for entry in os.scandir(PROJECT_ROOT_PATH):
            if entry.is_dir():
                projects.append({
                    "name": entry.name,
                    "path": entry.path
                })
    else:
        return {"error": "Root path does not exist", "path": PROJECT_ROOT_PATH}
    return {"projects": projects}

@app.get("/projects")
def get_projects():
    return db_manager.get_projects()

@app.post("/projects")
def create_project(data: ProjectInput):
    res = db_manager.create_project(data.id, data.name, data.local_path)
    return res

@app.get("/projects/{project_id}/shots")
def get_shots(project_id: str):
    return db_manager.get_shots_by_project(project_id)

@app.post("/shots")
def create_shot(data: ShotInput):
    res = db_manager.create_or_update_shot(
        data.id, 
        data.project_id, 
        data.pitch, 
        data.status, 
        data.veo_json_blob
    )
    return res

@app.get("/shots/{shot_id}/assets")
def get_assets(shot_id: str):
    return db_manager.get_assets_by_shot(shot_id)

@app.post("/assets")
def create_asset(data: AssetInput):
    if data.type not in ['keyframe', 'video']:
        raise HTTPException(status_code=400, detail="Invalid asset type")
    res = db_manager.create_asset(data.id, data.shot_id, data.type, data.local_path)
    return res

@app.post("/generate-keyframe")
def generate_keyframe(data: KeyframeRequest):
    # Resolve project path
    project = db_manager.get_project_by_id(data.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    project_path = project.get("local_path")
    if not project_path:
        project_path = os.path.join(PROJECT_ROOT_PATH, project.get("name"))

    try:
        final_path = run_pipeline(
            prompt=data.prompt,
            model_type=data.model_type,
            project_path=project_path,
            shot_id=data.shot_id,
            char_ref=data.char_ref_path,
            loc_ref=data.loc_ref_path
        )
        if not final_path:
            raise HTTPException(status_code=500, detail="Generation failed")
            
        # Register the new asset in DB
        asset_id = f"keyframe-{data.shot_id}-{int(time.time())}" if 'time' not in globals() else f"keyframe-{data.shot_id}"
        import time
        asset_id = f"keyframe-{data.shot_id}-{int(time.time())}"
        
        db_manager.create_asset(asset_id, data.shot_id, 'keyframe', final_path)
        
        return {"status": "success", "local_path": final_path, "asset_id": asset_id}
    except Exception as e:
        print(f"Error in generation endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # Ensure database tables exist before starting
    print("Checking database tables...")
    db_manager.init_db()
    uvicorn.run(app, host="127.0.0.1", port=8000)
