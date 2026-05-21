const API_BASE = "/api";
const FIREBASE_HISTORY_PATH = "AccidentHistory";
const alertList = document.getElementById("alert-list");
const alertCount = document.getElementById("alert-count");
const vehicleCount = document.getElementById("vehicle-count");
const highCount = document.getElementById("high-count");
const clearCount = document.getElementById("clear-count");
const currentLat = document.getElementById("current-lat");
const currentLng = document.getElementById("current-lng");
const currentMapLink = document.getElementById("current-map-link");
const mapElement = document.getElementById("map");
const connectionStatus = document.getElementById("connection-status");
const refreshButton = document.getElementById("refresh-button");
const exportButton = document.getElementById("export-button");
const alertSearch = document.getElementById("alert-search");
const filterTabs = document.querySelectorAll(".filter-tab");
const detailVehicle = document.getElementById("detail-vehicle");
const detailStatus = document.getElementById("detail-status");
const detailVibration = document.getElementById("detail-vibration");
const detailLed = document.getElementById("detail-led");
const lastUpdated = document.getElementById("last-updated");
const themeToggle = document.getElementById("theme-toggle");
const clearButton = document.getElementById("clear-button");
const simulateForm = document.getElementById("simulate-form");
const navButtons = document.querySelectorAll("[data-page]");
const pagePanels = document.querySelectorAll("[data-page-panel]");

let clearedAlarmCount = 0;
let allAlerts = [];
let selectedAlertId = null;
let activeFilter = "all";
let googleMap;
let googleMarker;
let googleMapsLoading;
let firebaseHistoryRef;
let backendPollingId;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("dashboardTheme", theme);
  themeToggle.textContent = theme === "dark" ? "Light Mode" : "Dark Mode";
}

function loadTheme() {
  const savedTheme = localStorage.getItem("dashboardTheme") || "light";
  setTheme(savedTheme);
}

function getAlertId(alert, index) {
  return String(alert.id ?? `${alert.vehicle_number || "vehicle"}-${alert.timestamp || index}`);
}

function normalizeAlert(data, fallbackId) {
  const latitude = data.latitude ?? "0.000000";
  const longitude = data.longitude ?? "0.000000";
  const hasCoordinates = Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));

  return {
    id: data.id ?? fallbackId,
    date: data.date ?? "-",
    time: data.time ?? "-",
    timestamp: data.timestamp ?? fallbackId,
    vehicle_type: data.vehicle_type ?? "Unknown",
    vehicle_number: data.vehicle_number ?? "Unknown",
    latitude,
    longitude,
    location: data.location ?? (hasCoordinates ? `${latitude}, ${longitude}` : "Location Not Available"),
    location_url: data.location_url ?? (hasCoordinates ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}` : ""),
    status: data.status ?? "DANGER",
    severity: data.severity ?? data.vibration_level ?? "High",
    vibration_g: data.vibration_g ?? data.acceleration_g ?? "0.00",
    vibration_level: data.vibration_level ?? data.severity ?? "High",
    led_state: data.led_state ?? data.vibration_level ?? data.severity ?? "High",
    accel_x: data.accel_x ?? data.ax ?? "0.00",
    accel_y: data.accel_y ?? data.ay ?? "0.00",
    accel_z: data.accel_z ?? data.az ?? "0.00",
    description: data.description ?? "Accident alert received from Firebase",
  };
}

function firebaseSnapshotToAlerts(snapshotValue) {
  if (!snapshotValue) return [];

  const records = Array.isArray(snapshotValue)
    ? snapshotValue.reduce((items, value, index) => {
        if (value) items[String(index)] = value;
        return items;
      }, {})
    : snapshotValue;

  return Object.entries(records)
    .filter(([, value]) => value && typeof value === "object")
    .map(([key, value]) => normalizeAlert(value, key))
    .sort((a, b) => String(b.timestamp || b.id).localeCompare(String(a.timestamp || a.id)));
}

function getSeverity(alert) {
  return String(alert.vibration_level || alert.severity || "normal").toLowerCase();
}

function getSeverityLabel(alert) {
  const severity = getSeverity(alert);
  if (severity.includes("high") || severity.includes("severe")) return "High";
  if (severity.includes("medium") || severity.includes("minor")) return "Medium";
  if (severity.includes("low")) return "Low";
  return "Normal";
}

function getSeverityClass(alert) {
  return `severity-${getSeverityLabel(alert).toLowerCase()}`;
}

function alertMatchesSearch(alert) {
  const query = alertSearch.value.trim().toLowerCase();
  if (!query) return true;

  return [
    alert.date,
    alert.time,
    alert.vehicle_type,
    alert.vehicle_number,
    alert.status,
    alert.description,
    alert.location,
    alert.latitude,
    alert.longitude,
    alert.vibration_level,
    alert.severity,
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function alertMatchesFilter(alert) {
  if (activeFilter === "all") return true;
  return getSeverityLabel(alert).toLowerCase() === activeFilter;
}

function getFilteredAlerts() {
  return allAlerts.filter((alert) => alertMatchesFilter(alert) && alertMatchesSearch(alert));
}

function formatAlert(alert) {
  const index = allAlerts.indexOf(alert);
  const rawAlertId = getAlertId(alert, index);
  const alertId = escapeHtml(rawAlertId);
  const selectedClass = selectedAlertId === rawAlertId ? " selected" : "";
  const latitude = alert.latitude ?? "";
  const longitude = alert.longitude ?? "";
  const hasCoordinates = Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
  const locationText = alert.location || (hasCoordinates ? `${latitude}, ${longitude}` : "Location Not Available");
  const locationUrl = alert.location_url || (hasCoordinates ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}` : "");
  const locationCell = locationUrl
    ? `<a class="table-map-link" href="${escapeHtml(locationUrl)}" target="_blank">${escapeHtml(locationText)}</a>`
    : escapeHtml(locationText);

  return `
    <tr class="history-row${selectedClass}" data-alert-id="${alertId}" tabindex="0">
      <td>${escapeHtml(alert.date || "-")}</td>
      <td>${escapeHtml(alert.time || "-")}</td>
      <td>${escapeHtml(alert.vehicle_type || "Unknown")}</td>
      <td>${escapeHtml(alert.vehicle_number || "Unknown")}</td>
      <td>${locationCell}</td>
      <td><span class="table-status ${getSeverityClass(alert)}">${escapeHtml(alert.status || "DANGER")}</span></td>
      <td>
        <button class="delete-record-button" data-alert-id="${alertId}" type="button">Delete</button>
      </td>
    </tr>
  `;
}

function updateConnectionStatus(text) {
  connectionStatus.textContent = text;
}

function updateSummary(alerts) {
  const uniqueVehicles = new Set(alerts.map((alert) => alert.vehicle_number || alert.vehicle_type).filter(Boolean));
  const highAlerts = alerts.filter((alert) => getSeverityLabel(alert) === "High").length;

  alertCount.textContent = alerts.length;
  vehicleCount.textContent = uniqueVehicles.size;
  highCount.textContent = highAlerts;
}

function applyAlerts(alerts, statusText = "System Online") {
  allAlerts = alerts;
  updateSummary(allAlerts);
  updateConnectionStatus(statusText);

  if (allAlerts.length === 0) {
    selectedAlertId = null;
    renderAlertList();
    updateDetailPanel(null);
    updateMap(0, 0);
    return;
  }

  const selectedStillExists = allAlerts.some((alert, index) => getAlertId(alert, index) === selectedAlertId);
  if (!selectedAlertId || !selectedStillExists) {
    selectedAlertId = getAlertId(allAlerts[0], 0);
  }

  renderAlertList();
  updateDetailPanel(allAlerts.find((alert, index) => getAlertId(alert, index) === selectedAlertId) || allAlerts[0]);
  updateMap(allAlerts[0].latitude, allAlerts[0].longitude);
}

function showPage(pageName) {
  navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.page === pageName);
  });
  pagePanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.pagePanel === pageName);
  });

  if (pageName === "location" && googleMap) {
    const center = googleMap.getCenter();
    setTimeout(() => {
      google.maps.event.trigger(googleMap, "resize");
      if (center) googleMap.setCenter(center);
    }, 50);
  }
}

function renderAlertList() {
  const filteredAlerts = getFilteredAlerts();

  if (allAlerts.length === 0) {
    alertList.innerHTML = '<tr><td colspan="7" class="empty-table-cell">No Accident Records Found</td></tr>';
    return;
  }

  if (filteredAlerts.length === 0) {
    alertList.innerHTML = '<tr><td colspan="7" class="empty-table-cell">No records match the current search or severity filter.</td></tr>';
    return;
  }

  alertList.innerHTML = filteredAlerts.map(formatAlert).join("");
}

function updateDetailPanel(alert) {
  if (!alert) {
    detailVehicle.textContent = "No alert selected";
    detailStatus.textContent = "Waiting";
    detailVibration.textContent = "Normal";
    detailLed.textContent = "Normal";
    lastUpdated.textContent = "Never";
    return;
  }

  detailVehicle.textContent = `${alert.vehicle_type || "Unknown"} - ${alert.vehicle_number || "Unknown"}`;
  detailStatus.textContent = alert.status || "Unknown";
  detailVibration.textContent = `${alert.vibration_g || "0.00"} g (${getSeverityLabel(alert)})`;
  detailLed.textContent = alert.led_state || getSeverityLabel(alert);
  lastUpdated.textContent = `${alert.date || ""} ${alert.time || ""}`.trim() || new Date().toLocaleString();
}

function selectAlert(alertId) {
  selectedAlertId = alertId;
  const selectedAlert = allAlerts.find((alert, index) => getAlertId(alert, index) === alertId) || allAlerts[0];
  updateDetailPanel(selectedAlert);
  if (selectedAlert) updateMap(selectedAlert.latitude, selectedAlert.longitude);
  renderAlertList();
}

function loadGoogleMaps() {
  if (!window.GOOGLE_MAPS_API_KEY) {
    mapElement.innerHTML = '<div class="map-message">Add GOOGLE_MAPS_API_KEY to show the live Google map here.</div>';
    return Promise.resolve(false);
  }

  if (window.google?.maps) {
    return Promise.resolve(true);
  }

  if (googleMapsLoading) {
    return googleMapsLoading;
  }

  googleMapsLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(window.GOOGLE_MAPS_API_KEY)}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(true);
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return googleMapsLoading;
}

async function updateMap(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);

  currentLat.textContent = Number.isFinite(lat) ? lat.toFixed(6) : "0.000000";
  currentLng.textContent = Number.isFinite(lng) ? lng.toFixed(6) : "0.000000";
  currentMapLink.href = `https://www.google.com/maps/search/?api=1&query=${currentLat.textContent},${currentLng.textContent}`;

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    mapElement.innerHTML = '<div class="map-message">Live location will appear here when Firebase receives coordinates.</div>';
    return;
  }

  const mapsReady = await loadGoogleMaps();
  if (!mapsReady) {
    return;
  }

  const position = { lat, lng };
  if (!googleMap) {
    googleMap = new google.maps.Map(mapElement, {
      center: position,
      zoom: 15,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
    });
    googleMarker = new google.maps.Marker({
      position,
      map: googleMap,
      title: "Latest ESP32 location",
    });
    return;
  }

  googleMap.setCenter(position);
  googleMarker.setPosition(position);
}

async function loadAlerts() {
  if (firebaseHistoryRef) {
    try {
      updateConnectionStatus("Updating...");
      const snapshot = await firebaseHistoryRef.once("value");
      applyAlerts(firebaseSnapshotToAlerts(snapshot.val()), "Firebase Connected");
    } catch (error) {
      updateConnectionStatus("Firebase Unreachable");
      console.error(error);
    }
    return;
  }

  try {
    updateConnectionStatus("Updating...");
    const response = await fetch(`${API_BASE}/alerts`);
    const data = await response.json();
    applyAlerts(data.alerts || [], data.error ? "Firebase Unreachable" : "System Online");
  } catch (error) {
    alertList.innerHTML = '<tr><td colspan="7" class="empty-table-cell">Unable to load records. Check the server connection.</td></tr>';
    updateConnectionStatus("Connection Issue");
    console.error(error);
  }
}

async function clearAlerts() {
  if (!confirm("Delete all accident records?")) return;

  try {
    if (firebaseHistoryRef) {
      await firebaseHistoryRef.remove();
      clearedAlarmCount += 1;
      clearCount.textContent = clearedAlarmCount;
      selectedAlertId = null;
      return;
    }

    const response = await fetch(`${API_BASE}/clear`, { method: "POST" });
    const result = await response.json();
    if (result.success) {
      clearedAlarmCount += 1;
      clearCount.textContent = clearedAlarmCount;
      selectedAlertId = null;
      await loadAlerts();
    }
  } catch (error) {
    console.error(error);
  }
}

async function deleteRecord(alertId) {
  if (!confirm("Delete this accident record?")) return;

  try {
    if (firebaseHistoryRef) {
      await firebaseHistoryRef.child(alertId).remove();
      clearedAlarmCount += 1;
      clearCount.textContent = clearedAlarmCount;
      if (selectedAlertId === alertId) selectedAlertId = null;
      alert("Record Deleted Successfully");
      return;
    }

    const response = await fetch(`${API_BASE}/alerts/${encodeURIComponent(alertId)}`, { method: "DELETE" });
    const result = await response.json();
    if (result.success) {
      clearedAlarmCount += 1;
      clearCount.textContent = clearedAlarmCount;
      if (selectedAlertId === alertId) selectedAlertId = null;
      await loadAlerts();
      alert("Record Deleted Successfully");
    }
  } catch (error) {
    console.error(error);
  }
}

function exportAlerts() {
  if (allAlerts.length === 0) return;

  const headers = ["date", "time", "vehicle_type", "vehicle_number", "status", "severity", "vibration_g", "led_state", "latitude", "longitude"];
  const rows = allAlerts.map((alert) =>
    headers
      .map((key) => `"${String(alert[key] ?? "").replace(/"/g, '""')}"`)
      .join(",")
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `vehicle-alerts-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

async function sendSimulatedAlert(event) {
  event.preventDefault();
  const selectedLevel = document.getElementById("sim-vibration-level").value;
  const payload = {
    vehicle_type: document.getElementById("vehicle-type").value,
    vehicle_number: document.getElementById("vehicle-number").value,
    latitude: document.getElementById("latitude").value,
    longitude: document.getElementById("longitude").value,
    status: document.getElementById("status").value,
    vibration_g: "2.25",
    vibration_level: selectedLevel,
    led_state: selectedLevel,
    accel_x: "3.12",
    accel_y: "8.04",
    accel_z: "20.18",
    description: "Manual simulation from dashboard UI",
  };

  try {
    if (firebaseHistoryRef) {
      const recordRef = firebaseHistoryRef.push();
      const now = new Date();
      await recordRef.set({
        ...payload,
        id: recordRef.key,
        date: now.toISOString().slice(0, 10),
        time: now.toLocaleTimeString("en-GB"),
        timestamp: now.toISOString(),
        location: `${payload.latitude}, ${payload.longitude}`,
        location_url: `https://www.google.com/maps/search/?api=1&query=${payload.latitude},${payload.longitude}`,
      });
      simulateForm.reset();
      return;
    }

    const response = await fetch(`${API_BASE}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (result.success) {
      await loadAlerts();
      simulateForm.reset();
    }
  } catch (error) {
    console.error(error);
  }
}

function startFirebaseClient() {
  if (!window.firebase || !window.FIREBASE_CONFIG) return false;

  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(window.FIREBASE_CONFIG);
    }

    firebaseHistoryRef = firebase.database().ref(FIREBASE_HISTORY_PATH);
    firebaseHistoryRef.on(
      "value",
      (snapshot) => applyAlerts(firebaseSnapshotToAlerts(snapshot.val()), "Firebase Connected"),
      (error) => {
        updateConnectionStatus("Firebase Unreachable");
        console.error(error);
      }
    );
    return true;
  } catch (error) {
    updateConnectionStatus("Firebase Unreachable");
    console.error(error);
    return false;
  }
}

themeToggle.addEventListener("click", () => {
  setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
});

refreshButton.addEventListener("click", loadAlerts);
exportButton.addEventListener("click", exportAlerts);
clearButton.addEventListener("click", clearAlerts);
simulateForm.addEventListener("submit", sendSimulatedAlert);
navButtons.forEach((button) => {
  button.addEventListener("click", () => showPage(button.dataset.page));
});
alertSearch.addEventListener("input", renderAlertList);
filterTabs.forEach((button) => {
  button.addEventListener("click", () => {
    filterTabs.forEach((tab) => tab.classList.remove("active"));
    button.classList.add("active");
    activeFilter = button.dataset.filter;
    renderAlertList();
  });
});
alertList.addEventListener("click", (event) => {
  const deleteButton = event.target.closest(".delete-record-button");
  if (deleteButton) {
    deleteRecord(deleteButton.dataset.alertId);
    return;
  }

  const alertItem = event.target.closest(".history-row");
  if (!alertItem || event.target.closest("a")) return;
  selectAlert(alertItem.dataset.alertId);
});
alertList.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const alertItem = event.target.closest(".history-row");
  if (!alertItem) return;
  event.preventDefault();
  selectAlert(alertItem.dataset.alertId);
});

loadTheme();
if (!startFirebaseClient()) {
  loadAlerts();
  backendPollingId = setInterval(loadAlerts, 6000);
}
