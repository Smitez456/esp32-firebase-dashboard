import os
from datetime import datetime
from flask import Flask, render_template, jsonify, request
import requests

app = Flask(__name__)
alerts = []

FIREBASE_DATABASE_URL = os.getenv(
    "FIREBASE_DATABASE_URL",
    "https://smartaccidentdetection-197fc-default-rtdb.firebaseio.com",
).rstrip("/")
FIREBASE_DATABASE_SECRET = os.getenv("FIREBASE_DATABASE_SECRET", "")
FIREBASE_ALERTS_PATH = os.getenv("FIREBASE_ALERTS_PATH", "AccidentHistory").strip("/")
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")


def firebase_enabled():
    return bool(FIREBASE_DATABASE_URL)


def firebase_url(path):
    url = f"{FIREBASE_DATABASE_URL}/{path}.json"
    if FIREBASE_DATABASE_SECRET:
        url = f"{url}?auth={FIREBASE_DATABASE_SECRET}"
    return url


def firebase_get_alerts():
    if not firebase_enabled():
        return alerts

    response = requests.get(firebase_url(FIREBASE_ALERTS_PATH), timeout=10)
    response.raise_for_status()
    records = response.json() or {}
    if isinstance(records, list):
        records = {str(index): value for index, value in enumerate(records) if value}

    firebase_alerts = []
    for key, value in records.items():
        if isinstance(value, dict):
            alert = normalize_alert(value, key)
            firebase_alerts.append(alert)

    return sorted(
        firebase_alerts,
        key=lambda item: item.get("_sort_key", ""),
        reverse=True,
    )


def firebase_push_alert(alert):
    if not firebase_enabled():
        alerts.insert(0, alert)
        if len(alerts) > 25:
            alerts.pop()
        return alert

    response = requests.post(firebase_url(FIREBASE_ALERTS_PATH), json=alert, timeout=10)
    response.raise_for_status()
    firebase_key = response.json().get("name")
    alert["id"] = firebase_key or alert["id"]
    if firebase_key:
        requests.patch(firebase_url(f"{FIREBASE_ALERTS_PATH}/{firebase_key}"), json={"id": firebase_key}, timeout=10)
    return alert


def format_alert(data):
    now = datetime.now()
    lat = data.get("latitude", "0.000000")
    lng = data.get("longitude", "0.000000")
    vibration_g = data.get("vibration_g", data.get("acceleration_g", "0.00"))
    vibration_level = data.get("vibration_level", data.get("severity", "Normal"))
    return {
        "id": len(alerts) + 1,
        "date": now.strftime("%Y-%m-%d"),
        "time": now.strftime("%H:%M:%S"),
        "timestamp": now.isoformat(timespec="seconds"),
        "vehicle_type": data.get("vehicle_type", "Unknown"),
        "vehicle_number": data.get("vehicle_number", "Unknown"),
        "latitude": lat,
        "longitude": lng,
        "location": data.get("location", f"{lat}, {lng}"),
        "location_url": f"https://www.google.com/maps/search/?api=1&query={lat},{lng}",
        "status": data.get("status", "Accident confirmed"),
        "severity": data.get("severity", vibration_level),
        "vibration_g": vibration_g,
        "vibration_level": vibration_level,
        "led_state": data.get("led_state", vibration_level),
        "accel_x": data.get("accel_x", data.get("ax", "0.00")),
        "accel_y": data.get("accel_y", data.get("ay", "0.00")),
        "accel_z": data.get("accel_z", data.get("az", "0.00")),
        "description": data.get("description", "Accident alert received from ESP32"),
    }


def normalize_alert(data, fallback_id):
    alert = format_alert(data)
    alert["id"] = data.get("id", fallback_id)
    alert["date"] = data.get("date", alert["date"])
    alert["time"] = data.get("time", alert["time"])
    alert["timestamp"] = data.get("timestamp", alert["timestamp"])
    alert["location"] = data.get("location", alert["location_url"])
    alert["_sort_key"] = data.get("timestamp") or fallback_id
    return alert


@app.route("/")
def index():
    return render_template("index.html", google_maps_api_key=GOOGLE_MAPS_API_KEY)


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/api/alerts", methods=["GET"])
def get_alerts():
    try:
        return jsonify({"alerts": firebase_get_alerts()})
    except requests.RequestException as error:
        return jsonify({"alerts": alerts, "error": str(error)})


@app.route("/api/submit", methods=["POST"])
def submit_alert():
    payload = request.get_json(force=True, silent=True)
    if not payload:
        return jsonify({"error": "Invalid JSON payload"}), 400

    try:
        alert = firebase_push_alert(format_alert(payload))
        return jsonify({"success": True, "alert": alert})
    except requests.RequestException as error:
        return jsonify({"error": f"Firebase write failed: {error}"}), 502


@app.route("/api/clear", methods=["POST"])
def clear_alerts():
    alerts.clear()
    if firebase_enabled():
        try:
            requests.delete(firebase_url(FIREBASE_ALERTS_PATH), timeout=10).raise_for_status()
        except requests.RequestException as error:
            return jsonify({"error": f"Firebase clear failed: {error}"}), 502
    return jsonify({"success": True})


@app.route("/api/alerts/<alert_id>", methods=["DELETE"])
def delete_alert(alert_id):
    global alerts
    alerts = [alert for alert in alerts if str(alert.get("id")) != str(alert_id)]
    if firebase_enabled():
        try:
            requests.delete(firebase_url(f"{FIREBASE_ALERTS_PATH}/{alert_id}"), timeout=10).raise_for_status()
        except requests.RequestException as error:
            return jsonify({"error": f"Firebase delete failed: {error}"}), 502
    return jsonify({"success": True})


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    debug_mode = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug_mode)
