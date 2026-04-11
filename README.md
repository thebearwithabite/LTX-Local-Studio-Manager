# VEO 3.1 Prompt Machine: Director's Assistant

An interactive AI-powered production suite that transforms creative scripts into structured, production-ready VEO 3.1 JSON prompts. Designed for directors and cinematographers to maintain visual continuity and technical precision across complex AI video sequences.

## 🎬 Core Production Features

*   **Intelligent Script Ingestion:** Seamlessly import creative treatments via text or file upload (.txt, .md, .rtf, .pdf).
*   **Smart Asset Library:**
    *   **Automated Entity Detection:** AI-driven analysis identifies recurring Characters and Locations.
    *   **Visual Continuity:** Store reference images (Ingredients) for assets to ensure consistent visual identity across shots.
    *   **Contextual Mapping:** Automatically assigns assets to shots based on narrative context.
*   **Automated Pre-Production Pipeline:**
    *   **Shot Breakdown:** Converts scripts into detailed shot lists with cinematic pitches.
    *   **Scene Planning:** Generates `ScenePlan` logic (narrative beats, timing, extension strategies).
    *   **VEO 3.1 JSON Generation:** Produces production-ready JSON prompts, including complex "Extend" logic for long-form sequences.
    *   **AI Storyboarding:** Generates 2K cinematic keyframes using `imagen-3` to visualize the director's vision.
*   **Interactive Shot Book:**
    *   Real-time status tracking and in-app JSON editing.
    *   **Asset Toggling:** Manually override or fine-tune asset assignments for specific shots.
    *   **Guidance Media Bin:** Upload reference images to guide the AI's visual generation.

## 💰 Production Mode & Cost Tracking

The application features a **Production Mode** that provides real-time API cost estimation to help manage project budgets:

| Service | Model | Rate |
| :--- | :--- | :--- |
| **Video Generation** | Veo 3.1 Fast | **$0.08 / second** |
| **Keyframes** | Imagen 3 | $0.03 / image |
| **Logic & Planning** | Gemini 1.5 Pro | $3.50 (In) / $10.50 (Out) per 1M tokens |
| **Utility Tasks** | Gemini 1.5 Flash | $0.075 (In) / $0.30 (Out) per 1M tokens |

*Estimated costs are displayed in the project header and included in all exported reports.*

## 🛠 Technical Stack & Setup

*   **Frontend:** React 18, TypeScript, TailwindCSS, Motion.
*   **Backend:** Firebase (Firestore, Auth, Storage).
*   **AI Engine:** Google Gemini API (Pro, Flash, Imagen, Veo).

### Environment Configuration

Configure your `.env` file with your Firebase credentials:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_DATABASE_ID=(default)
```

## 📦 Exporting & Data Safety

*   **Local-First Storage:** Data is saved to your browser's Local Storage. **Warning:** Clearing browser cache or using Incognito mode will erase unsaved work.
*   **Project Backups:** Use **"Save Project"** to download a `.json` backup.
*   **Production Export:** Downloads a structured `.zip` package:
    *   `/Assets`: Character/Location metadata and reference images.
    *   `/Source`: Original script.
    *   `/Production`: Shot list and individual VEO JSON prompts.
*   **Visual Reports:** Standalone HTML storyboards with cost breakdowns.

