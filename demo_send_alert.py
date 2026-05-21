import json
import random
import time
from datetime import datetime

import requests

DASHBOARD_URL = "http://localhost:5000/api/submit"

vehicles = [
    {"vehicle_type": "Ambulance", "vehicle_number": "EMG-001"},
    {"vehicle_type": "Delivery Truck", "vehicle_number": "DLV-421"},
    {"vehicle_type": "Taxi", "vehicle_number": "TX-911"},
    {"vehicle_type": "Bus", "vehicle_number": "BUS-078"},
]

locations = [
    {"latitude": "12.971598", "longitude": "77.594566"},
    {"latitude": "28.704060", "longitude": "77.102493"},
    {"latitude": "19.075983", "longitude": "72.877655"},
    {"latitude": "13.082680", "longitude": "80.270718"},
]

statuses = [
    "Accident confirmed",
    "Minor collision",
    "Severe collision",
    "Under investigation",
]

messages = [
    "Impact detected; airbags deployed.",
    "Vehicle overturned after collision.",
    "Multiple vehicles involved; emergency response required.",
    "High-speed crash detected; location report attached.",
]


def send_alert(alert):
    headers = {"Content-Type": "application/json"}
    response = requests.post(DASHBOARD_URL, headers=headers, data=json.dumps(alert))
    response.raise_for_status()
    return response.json()


def make_alert(index):
    vehicle = vehicles[index % len(vehicles)]
    location = locations[index % len(locations)]
    return {
        "vehicle_type": vehicle["vehicle_type"],
        "vehicle_number": vehicle["vehicle_number"],
        "latitude": location["latitude"],
        "longitude": location["longitude"],
        "status": random.choice(statuses),
        "description": random.choice(messages),
    }


def run_demo(count=3, delay=2):
    print(f"Sending {count} demo alert(s) to {DASHBOARD_URL}")
    for i in range(count):
        alert = make_alert(i)
        result = send_alert(alert)
        print(f"  Sent alert {i+1}: {alert['vehicle_type']} {alert['vehicle_number']} -> {result.get('alert', {}).get('status')}")
        time.sleep(delay)
    print("Demo completed. Open http://localhost:5000 to view the alerts.")


if __name__ == "__main__":
    run_demo(count=4, delay=1)
