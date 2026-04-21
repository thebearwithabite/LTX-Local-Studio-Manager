import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { google } from "googleapis";
import cookieParser from "cookie-parser";
import fs from "fs";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(cookieParser());

  const redirectUri = process.env.APP_URL 
    ? `${process.env.APP_URL.replace(/\/$/, '')}/api/auth/google/callback`
    : `http://localhost:3000/api/auth/google/callback`;

  console.log("Using redirect URI:", redirectUri);

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Google OAuth URL
  app.get("/api/auth/google/url", (req, res) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(500).json({ error: "Google OAuth not configured" });
    }
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/drive.file'],
      prompt: 'consent'
    });
    res.json({ url });
  });

  // Google OAuth Callback
  app.get("/api/auth/google/callback", async (req, res) => {
    const { code } = req.query;
    try {
      const { tokens } = await oauth2Client.getToken(code as string);
      res.cookie('google_tokens', JSON.stringify(tokens), {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("OAuth error", error);
      res.status(500).send("Authentication failed");
    }
  });

  // Check Auth Status
  app.get("/api/auth/google/status", (req, res) => {
    const tokens = req.cookies.google_tokens;
    res.json({ authenticated: !!tokens });
  });

  // Save to Local Filesystem Instead of Drive
  app.post("/api/drive/save", async (req, res) => {
    const { dataset } = req.body;
    if (!Array.isArray(dataset)) {
      return res.status(400).json({ error: "Dataset must be an array" });
    }

    try {
      // Direct Link to the Studio Manager's Training Data folder
      const workspaceRoot = "/Users/ryanthomson/Github/LTX-Local-Studio-Manager";
      const dataDir = path.join(workspaceRoot, "services/Training Data");
      
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      // Generate a unique timestamp for the autonomous watcher to pick up
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `extraction_${timestamp}.json`;
      const filePath = path.join(dataDir, filename);
      
      fs.writeFileSync(filePath, JSON.stringify(dataset, null, 2), 'utf8');
      
      console.log(`Saved dataset with ${dataset.length} entries to ${filePath}`);
      res.json({ success: true, local_path: filePath });
    } catch (error) {
      console.error("Local save error", error);
      res.status(500).json({ error: "Failed to save to local disk" });
    }
  });

  // Load from Drive
  app.get("/api/drive/load", async (req, res) => {
    const tokens = req.cookies.google_tokens;
    if (!tokens) {
      console.log("No tokens found in cookie");
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri
      );
      auth.setCredentials(JSON.parse(tokens));

      const drive = google.drive({ version: 'v3', auth });
      
      console.log("Searching for dataset file in Drive...");
      const listRes = await drive.files.list({
        q: "name = 'director_assistant_dataset.json' and trashed = false",
        fields: 'files(id, name)',
        spaces: 'drive'
      });

      if (listRes.data.files && listRes.data.files.length > 0) {
        const fileId = listRes.data.files[0].id!;
        console.log(`Found file: ${fileId}. Downloading content...`);
        
        const fileRes = await drive.files.get({
          fileId: fileId,
          alt: 'media'
        }, { responseType: 'json' });
        
        let dataset = fileRes.data;
        
        // Ensure dataset is an array
        if (!Array.isArray(dataset)) {
          console.log("Dataset from Drive is not an array, attempting to parse if it's a string");
          if (typeof dataset === 'string') {
            try {
              dataset = JSON.parse(dataset);
            } catch (e) {
              console.error("Failed to parse dataset string", e);
              return res.status(500).json({ error: "Invalid dataset format in Drive" });
            }
          } else if (dataset && typeof dataset === 'object' && (dataset as any).dataset) {
            // Handle case where it might be wrapped in { dataset: [...] }
            dataset = (dataset as any).dataset;
          }
        }

        if (Array.isArray(dataset)) {
          console.log(`Successfully loaded ${dataset.length} entries from Drive`);
          res.json({ dataset });
        } else {
          console.error("Loaded data is not an array after parsing", dataset);
          res.status(500).json({ error: "Dataset in Drive is not a valid array" });
        }
      } else {
        console.log("No dataset file found in Drive");
        res.status(404).json({ error: "No dataset found in Drive" });
      }
    } catch (error) {
      console.error("Drive load error", error);
      res.status(500).json({ error: "Failed to load from Drive" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
