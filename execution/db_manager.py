import os
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2 import sql
from dotenv import load_dotenv

load_dotenv()

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "postgres")
DB_USER = os.getenv("DB_USER", "bear")
DB_PASS = os.getenv("DB_PASS", "purple123")

def get_connection():
    """Returns a new connection to the PostgreSQL database."""
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASS
    )
    conn.autocommit = True
    return conn

def init_db():
    """Initializes the database schema."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            # Create projects table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    local_path TEXT,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """)

            # Create shots table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS shots (
                    id TEXT PRIMARY KEY,
                    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
                    pitch TEXT,
                    status TEXT,
                    veo_json_blob JSONB
                );
            """)

            # Create assets table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS assets (
                    id TEXT PRIMARY KEY,
                    shot_id TEXT REFERENCES shots(id) ON DELETE CASCADE,
                    type TEXT CHECK (type IN ('keyframe', 'video')),
                    local_path TEXT
                );
            """)
            print("Database initialized successfully.")
    except Exception as e:
        print(f"Error initializing DB: {e}")
    finally:
        conn.close()

# CRUD for Projects
def create_project(project_id, name, local_path=None):
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                INSERT INTO projects (id, name, local_path)
                VALUES (%s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET 
                    name = EXCLUDED.name,
                    local_path = EXCLUDED.local_path
                RETURNING *;
            """, (project_id, name, local_path))
            return cur.fetchone()
    finally:
        conn.close()

def get_projects():
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM projects ORDER BY created_at DESC;")
            return cur.fetchall()
    finally:
        conn.close()

def get_project_by_id(project_id):
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM projects WHERE id = %s;", (project_id,))
            return cur.fetchone()
    finally:
        conn.close()

# CRUD for Shots
def create_or_update_shot(shot_id, project_id, pitch, status, veo_json_blob=None):
    conn = get_connection()
    try:
        import json
        veo_json_str = json.dumps(veo_json_blob) if veo_json_blob else None
        
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                INSERT INTO shots (id, project_id, pitch, status, veo_json_blob)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET 
                    pitch = EXCLUDED.pitch,
                    status = EXCLUDED.status,
                    veo_json_blob = EXCLUDED.veo_json_blob
                RETURNING *;
            """, (shot_id, project_id, pitch, status, veo_json_str))
            return cur.fetchone()
    finally:
        conn.close()

def get_shots_by_project(project_id):
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM shots WHERE project_id = %s;", (project_id,))
            return cur.fetchall()
    finally:
        conn.close()

# CRUD for Assets
def create_asset(asset_id, shot_id, asset_type, local_path):
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                INSERT INTO assets (id, shot_id, type, local_path)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET 
                    local_path = EXCLUDED.local_path
                RETURNING *;
            """, (asset_id, shot_id, asset_type, local_path))
            return cur.fetchone()
    finally:
        conn.close()

def get_assets_by_shot(shot_id):
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM assets WHERE shot_id = %s;", (shot_id,))
            return cur.fetchall()
    finally:
        conn.close()

if __name__ == "__main__":
    init_db()
