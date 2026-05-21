# ESP32 Wi-Fi Location Tracking Dashboard

This demo contains a working dashboard and a matching ESP32 sketch for Wi-Fi-based accident tracking.

## What is included

- `dashboard.py`: Flask server exposing a dashboard UI and REST API endpoints backed by Firebase Realtime Database
- `templates/index.html`: Interactive dashboard with light/dark mode, smart alert modules, and an accident history table
- `static/styles.css`: Dashboard styling for both themes
- `static/app.js`: Dashboard logic, alert management, and API integration
- `esp32_location_accident.ino`: ESP32 sketch for Wi-Fi scan, Google Geolocation API, accident detection, and dashboard upload
- `requirements.txt`: Python dependencies for the dashboard server

## Run the dashboard

1. Create a local virtual environment and install dependencies:

```bash
cd esp32_dashboard
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

2. Set Firebase and Google Maps configuration in the same terminal:

```powershell
$env:FIREBASE_DATABASE_URL="https://smartaccidentdetection-197fc-default-rtdb.firebaseio.com"
$env:FIREBASE_ALERTS_PATH="AccidentHistory"
$env:GOOGLE_MAPS_API_KEY="YOUR_GOOGLE_MAPS_BROWSER_KEY"
```

If your Realtime Database rules require a token, also set:

```powershell
$env:FIREBASE_DATABASE_SECRET="YOUR_DATABASE_SECRET_OR_AUTH_TOKEN"
```

3. Start the server without activating the venv:

```bash
cd esp32_dashboard
.\.venv\Scripts\python.exe dashboard.py
```

4. Open the dashboard in your browser:

```
http://localhost:5000
```

> If PowerShell rejects `activate` because running scripts is disabled, use the direct venv interpreter path shown above.

## ESP32 setup

1. Open `esp32_dashboard/esp32_location_accident.ino` in the Arduino IDE.
2. Install these Arduino libraries if not already installed:
   - `WiFi.h`
   - `HTTPClient.h`
   - `ArduinoJson`
   - `Wire.h`
   - `Adafruit_MPU6050`
   - `LiquidCrystal_I2C`
3. Replace `YOUR_WIFI_SSID`, `YOUR_WIFI_PASSWORD`, `YOUR_GOOGLE_API_KEY`, and `firebaseDatabaseUrl` with your values.
4. Connect the three vibration LED bulbs to the configured pins: low `25`, medium `26`, high `27`, or change `lowLedPin`, `mediumLedPin`, and `highLedPin` in the sketch.
5. If your Firebase database requires auth, set `firebaseDatabaseSecret` in the sketch.
6. Upload to an ESP32 board.

## Demo test mode

Run the demo sender directly with the virtual environment interpreter:

```bash
cd esp32_dashboard
.\.venv\Scripts\python.exe demo_send_alert.py
```

This script submits sample accident alerts to the dashboard server so you can verify UI behavior and alert handling.

## Public Internet Access (Port Forwarding)

To allow users from **any WiFi network** to access your dashboard without third-party services:

## Public Deployment

This project is now ready to deploy on a public server or container host.

### Deploy on Render

The repository includes a `render.yaml` Blueprint configured for Render. Render expects this file at the GitHub repository root, so upload the contents of this `esp32_dashboard` folder as the repo root.

1. Push this project to GitHub.
2. Open https://dashboard.render.com.
3. Choose **New +** -> **Blueprint**.
4. Connect the GitHub repo that contains `render.yaml`.
5. Render will create the `esp32-firebase-dashboard` web service.
6. Add environment variables when prompted:

```text
FIREBASE_DATABASE_URL=https://smartaccidentdetection-197fc-default-rtdb.firebaseio.com
FIREBASE_ALERTS_PATH=AccidentHistory
FIREBASE_DATABASE_SECRET=YOUR_DATABASE_SECRET_OR_AUTH_TOKEN
GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_BROWSER_KEY
```

If your Firebase rules allow test reads/writes without auth, leave `FIREBASE_DATABASE_SECRET` empty.

7. Deploy and open the Render URL, such as:

```bash
https://esp32-vehicle-safety-dashboard.onrender.com
```

For the ESP32 sketch, set:

```cpp
const char* dashboardSubmitUrl = "https://YOUR_RENDER_SERVICE.onrender.com/api/submit";
```

The ESP32 sketch sends main telemetry directly to Firebase. The Render `/api/submit` URL is only the fallback dashboard upload endpoint for accident events.

Render may sleep free services after inactivity. The first request after sleep can take a little longer.

### Deploy with another cloud platform

Use any platform that supports Python Flask apps or Docker containers.

- If your host supports `Procfile` (Heroku, Railway): the app will run via `gunicorn`
- If you prefer containers: use the provided `Dockerfile`

### Deploy using Docker

```bash
cd esp32_dashboard
docker build -t esp32-dashboard .
docker run -p 5000:5000 esp32-dashboard
```

Then the public host should expose port `5000` to the internet.

### Deploy using a Python web host

The app uses `dashboard.py` as the Flask entrypoint. Your host should start it with either:

```bash
gunicorn dashboard:app --bind 0.0.0.0:$PORT --workers 2
```

or via the included `Procfile`.

### What to share

Once deployed, share the public URL from your host provider, for example:

```bash
https://yourapp.example.com
```

## Notes

- The dashboard supports dark/light theme, Firebase accident history, per-record deletion, vibration levels, LED state, and a Google Maps marker for the newest coordinates.
- The ESP32 sketch sends MPU6050 vibration data and Wi-Fi geolocation directly to Firebase. The old dashboard HTTP POST remains as a fallback for accident events.
- For security, prefer a host with HTTPS and authentication.
