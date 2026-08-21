// =========================
// LOGIN / REGISTER
// =========================
async function login() {
  const username = document.getElementById("username")?.value.trim();
  const password = document.getElementById("password")?.value.trim();

  if (!username || !password) {
    return alert("Please fill in all fields!");
  }

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (data.success) {
      localStorage.setItem("isLogin",     "true");
      localStorage.setItem("role",        data.user.role);
      localStorage.setItem("username",    data.user.username);
      localStorage.setItem("fullName",    data.user.first_name + " " + data.user.last_name);
      localStorage.setItem("patientCode", data.user.patient_code || "");

      window.location.href = "/home";
    } else {
      alert("Incorrect username or password!");
    }
  } catch (err) {
    alert("Server error!");
  }
}

const logoutBtn = document.getElementById("logoutBtn");

logoutBtn?.addEventListener("click", async () => {
  try {
    await fetch("/api/logout", { method: "POST" });
  } catch (err) {
    console.error(err);
  }
  localStorage.clear();
  window.location.replace("/login");
});

function register() {
  window.location.href = "/register";
}

function forgotPassword() {
  const username = document.getElementById("username").value.trim();
  if (!username) {
    alert("Please enter your username!");
    return;
  }

  let loading = document.getElementById("loadingPopup");
  if (!loading) {
    loading = document.createElement("div");
    loading.id = "loadingPopup";
    loading.innerHTML = `
      <div class="box">
        <div class="spinner"></div>
        <p id="loadingText">Sending...</p>
      </div>
    `;
    document.body.appendChild(loading);

    const style = document.createElement("style");
    style.innerHTML = `
      #loadingPopup {
        position: fixed; top: 0; left: 0;
        width: 100%; height: 100%;
        background: rgba(0,0,0,0.6);
        display: flex; justify-content: center; align-items: center;
        z-index: 9999;
      }
      #loadingPopup .box {
        background: #1e1e1e; color: white;
        padding: 20px 30px; border-radius: 15px;
        text-align: center; min-width: 200px;
      }
      .spinner {
        width: 40px; height: 40px;
        border: 5px solid #ccc; border-top: 5px solid #00aaff;
        border-radius: 50%;
        animation: spin 1s linear infinite; margin: 10px auto;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);
  }

  const text    = document.getElementById("loadingText");
  const spinner = loading.querySelector(".spinner");

  loading.style.display = "flex";
  text.innerText        = "Sending...";
  spinner.style.display = "block";

  fetch("api/mail/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  })
    .then(res => res.json())
    .then(data => {
      text.innerText        = data.message || "Sent successfully!";
      spinner.style.display = "none";
      setTimeout(() => { loading.style.display = "none"; }, 2000);
    })
    .catch(() => {
      text.innerText        = "Server error!";
      spinner.style.display = "none";
      setTimeout(() => { loading.style.display = "none"; }, 2000);
    });
}

// =========================
// REGISTER
// =========================
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("registerForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const first_name       = document.getElementById("first_name").value.trim();
    const last_name        = document.getElementById("last_name").value.trim();
    const username         = document.getElementById("username").value.trim();
    const email            = document.getElementById("email").value.trim();
    const password         = document.getElementById("password").value.trim();
    const confirm_password = document.getElementById("confirm_password").value.trim();

    if (!first_name || !last_name || !username || !email || !password) {
      return alert("Please fill in all fields!");
    }

    if (password !== confirm_password) {
      return alert("Passwords do not match!");
    }

    try {
      const res  = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_name, last_name, username, email, password, confirm_password }),
      });
      const data = await res.json();

      if (data.success) {
        alert("Registration successful!");
        window.location.href = "/login";
      } else {
        alert(data.error);
      }
    } catch (err) {
      console.error(err);
      alert("Server error!");
    }
  });
});

// =========================
// HOME - MAP
// =========================

const map = L.map("map").setView([10.7769, 106.7009], 14);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap"
}).addTo(map);

let userMarker     = null;
let facilityMarker = null;
let routeLine      = null;
let watchId        = null;

const MEDICAL_AMENITIES = [
    "hospital", "clinic", "pharmacy",
    "doctors", "health_centre", "dentist", "nursing_home"
];

const AMENITY_LABELS = {
    hospital:      "Hospital",
    clinic:        "Clinic",
    pharmacy:      "Pharmacy",
    doctors:       "Medical Practice",
    health_centre: "Health Centre",
    dentist:       "Dental Clinic",
    nursing_home:  "Nursing Home"
};

let lastSearchLat  = null;
let lastSearchLon  = null;
const MIN_MOVE_METERS = 2;

function startTracking() {
    if (!navigator.geolocation) {
        alert("Geolocation is not supported by your browser!");
        return;
    }

    watchId = navigator.geolocation.watchPosition(
        async (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;

            if (!userMarker) {
                map.setView([lat, lon], 15);
                userMarker = L.marker([lat, lon])
                    .addTo(map)
                    .bindPopup("Your Location")
                    .openPopup();
            } else {
                userMarker.setLatLng([lat, lon]);
            }

            const moved = (lastSearchLat === null) ||
                haversineDistance(lat, lon, lastSearchLat, lastSearchLon) > MIN_MOVE_METERS;

            if (moved) {
                lastSearchLat = lat;
                lastSearchLon = lon;
                await findNearestMedicalFacility(lat, lon);
            }
        },
        (err) => {
            console.error("Location error:", err);
            if (document.getElementById("pharmacyInfo")) {
                document.getElementById("pharmacyInfo").innerHTML = "Unable to get location.";
            }
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
}

async function findNearestMedicalFacility(lat, lon) {
    try {
        const response = await fetch(`/api/nearby-facilities?lat=${lat}&lon=${lon}`);
        const data     = await response.json();

        if (!data.elements || data.elements.length === 0) {
            document.getElementById("pharmacyInfo").innerHTML =
                "No medical facilities found nearby (5km radius)";
            return;
        }

        const elements = data.elements.map(el => ({
            ...el,
            lat: el.lat ?? el.center?.lat,
            lon: el.lon ?? el.center?.lon
        })).filter(el => el.lat && el.lon);

        const nearest = findClosest(lat, lon, elements);
        updateFacilityMarker(nearest);
        updateFacilityInfo(nearest);
        drawRoute(lat, lon, nearest.lat, nearest.lon);

    } catch (err) {
        console.error("Error finding medical facilities:", err);
        document.getElementById("pharmacyInfo").innerHTML = "Error searching for medical facilities.";
    }
}

function findClosest(userLat, userLon, elements) {
    let nearest = null;
    let minDist = Infinity;

    for (const el of elements) {
        const d = haversineDistance(userLat, userLon, el.lat, el.lon);
        if (d < minDist) { minDist = d; nearest = { ...el, distance: d }; }
    }
    return nearest;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R     = 6371000;
    const toRad = x => x * Math.PI / 180;
    const dLat  = toRad(lat2 - lat1);
    const dLon  = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function updateFacilityMarker(facility) {
    const pos    = [facility.lat, facility.lon];
    const amenity = facility.tags?.amenity || "unknown";
    const label  = AMENITY_LABELS[amenity] || "Medical Facility";
    const name   = facility.tags?.name || label;

    if (!facilityMarker) {
        facilityMarker = L.marker(pos).addTo(map)
            .bindPopup(`<b>${name}</b><br><small>${label}</small>`);
    } else {
        facilityMarker.setLatLng(pos);
        facilityMarker.setPopupContent(`<b>${name}</b><br><small>${label}</small>`);
    }
}

function updateFacilityInfo(facility) {
    const infoEl  = document.getElementById("pharmacyInfo");
    if (!infoEl) return;

    const amenity  = facility.tags?.amenity || "unknown";
    const label   = AMENITY_LABELS[amenity] || "Medical Facility";
    const name    = facility.tags?.name || "Unknown";
    const dist    = Math.round(facility.distance);
    const distText = dist >= 1000 ? (dist / 1000).toFixed(1) + " km" : dist + " m";

    infoEl.innerHTML = `<b>${label}</b><br>${name}<br><small>Distance: ${distText}</small>`;
}

async function drawRoute(startLat, startLon, endLat, endLon) {
    try {
        const url =
            `https://router.project-osrm.org/route/v1/driving/` +
            `${startLon},${startLat};${endLon},${endLat}` +
            `?overview=full&geometries=geojson`;

        const response = await fetch(url);
        const data     = await response.json();

        if (!data.routes || !data.routes[0]) return;

        const route = data.routes[0].geometry.coordinates.map(p => [p[1], p[0]]);

        if (routeLine) map.removeLayer(routeLine);

        routeLine = L.polyline(route, {
            color: "#2196f3", weight: 5, opacity: 0.8
        }).addTo(map);

        map.fitBounds(
            L.latLngBounds([startLat, startLon], [endLat, endLon]),
            { padding: [60, 60] }
        );

    } catch (err) {
        console.error("Route drawing error:", err);
    }
}

startTracking();

// =========================
// NAVBAR / ACCOUNT MODAL
// =========================

document.addEventListener("DOMContentLoaded", () => {
    const role             = localStorage.getItem("role");
    const manageAccountBtn = document.getElementById("manageAccountBtn");
    if (manageAccountBtn) {
        manageAccountBtn.style.display = role === "admin" ? "inline-block" : "none";
    }
});

const manageBtn         = document.getElementById("manageAccountBtn");
const accountModal      = document.getElementById("accountModal");
const closeAccountModal = document.getElementById("closeAccountModal");
const editUserModal     = document.getElementById("editUserModal");

let allUsers = [];

function renderUserTable(users) {
    const tbody = document.querySelector("#userTable tbody");
    tbody.innerHTML = "";

    if (users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#aaa;padding:20px;">No accounts found</td></tr>`;
        return;
    }

    users.forEach(user => {
        const roleClass = { admin: "role-admin", doctor: "role-doctor", patient: "role-patient" }[user.role] || "role-patient";
        const roleLabel = { admin: "Admin", doctor: "Doctor", patient: "Patient" }[user.role] || user.role;

        tbody.innerHTML += `
            <tr>
                <td>${user.id}</td>
                <td><span class="role-badge ${roleClass}">${roleLabel}</span></td>
                <td>${user.username}</td>
                <td>${user.patient_code || "<span style='color:#ccc'>—</span>"}</td>
                <td>${user.first_name || ""} ${user.last_name || ""}</td>
                <td>
                    <button class="btn-edit" onclick="openEditUser(${user.id})">
                        ✏️ Edit
                    </button>
                </td>
            </tr>
        `;
    });
}

if (manageBtn) {
    manageBtn.addEventListener("click", async () => {
        accountModal.style.display = "block";
        document.getElementById("userSearchInput").value = "";
        try {
            const res = await fetch("/api/users");
            allUsers  = await res.json();
            renderUserTable(allUsers);
        } catch (err) {
            console.error(err);
            alert("Failed to load account list");
        }
    });
}

if (closeAccountModal) {
    closeAccountModal.addEventListener("click", () => {
        accountModal.style.display = "none";
    });
}

document.getElementById("userSearchInput")?.addEventListener("input", (e) => {
    const kw = e.target.value.trim().toLowerCase();
    if (!kw) return renderUserTable(allUsers);

    const filtered = allUsers.filter(u =>
        (u.username     || "").toLowerCase().includes(kw) ||
        (u.first_name   || "").toLowerCase().includes(kw) ||
        (u.last_name    || "").toLowerCase().includes(kw) ||
        (u.patient_code || "").toLowerCase().includes(kw)
    );
    renderUserTable(filtered);
});

function openEditUser(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    document.getElementById("editUserId").value          = user.id;
    document.getElementById("editFirstName").value       = user.first_name  || "";
    document.getElementById("editLastName").value        = user.last_name   || "";
    document.getElementById("editUsername").value        = user.username    || "";
    document.getElementById("editRole").value            = user.role        || "patient";
    document.getElementById("editPassword").value        = "";
    document.getElementById("editConfirmPassword").value = "";

    editUserModal.style.display = "block";
}

document.getElementById("closeEditUserModal")?.addEventListener("click", () => {
    editUserModal.style.display = "none";
});

document.getElementById("cancelEditUserBtn")?.addEventListener("click", () => {
    editUserModal.style.display = "none";
});

document.getElementById("saveEditUserBtn")?.addEventListener("click", async () => {
    const id               = document.getElementById("editUserId").value;
    const first_name       = document.getElementById("editFirstName").value.trim();
    const last_name        = document.getElementById("editLastName").value.trim();
    const username         = document.getElementById("editUsername").value.trim();
    const role             = document.getElementById("editRole").value;
    const password         = document.getElementById("editPassword").value;
    const confirm_password = document.getElementById("editConfirmPassword").value;

    if (!first_name || !last_name || !username) {
        alert("Please fill in first name, last name and username!");
        return;
    }

    if (password && password !== confirm_password) {
        alert("Passwords do not match!");
        return;
    }

    try {
        const res  = await fetch(`/api/users/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ first_name, last_name, username, role, password: password || null })
        });
        const data = await res.json();

        if (data.success) {
            alert("Account updated successfully!");
            editUserModal.style.display = "none";

            const res2 = await fetch("/api/users");
            allUsers   = await res2.json();
            renderUserTable(allUsers);
        } else {
            alert(data.error || "Update failed!");
        }
    } catch (err) {
        console.error(err);
        alert("Server error!");
    }
});
// =========================
// SENSOR DATA
// =========================

document.addEventListener("DOMContentLoaded", () => {

    const role = localStorage.getItem("role");

    const addPatientBtn = document.getElementById("addPatientBtn");
    const manageAccountBtn = document.getElementById("manageAccountBtn");

    if (addPatientBtn) addPatientBtn.style.display = "none";
    if (manageAccountBtn) manageAccountBtn.style.display = "none";

    if (role === "doctor") {
        if (addPatientBtn) {
            addPatientBtn.style.display = "inline-block";
        }
    }

    if (role === "admin") {
        if (addPatientBtn) {
            addPatientBtn.style.display = "inline-block";
        }

        if (manageAccountBtn) {
            manageAccountBtn.style.display = "inline-block";
        }
    }

});

let chartInstance = null;

const modal = document.getElementById("chartModal");
const closeBtn = document.getElementById("closeModal");

function getCurrentPatientCode() {

    const role = localStorage.getItem("role");

    if (role === "patient") {
        return localStorage.getItem("patientCode") || "";
    }

    return document.getElementById("patientCode")?.value.trim() || "";
}

async function updateSensorData() {

    const patientCode = getCurrentPatientCode();

    if (!patientCode) return;

    try {

        const response = await fetch(`/api/data/${patientCode}`);
        const data = await response.json();

        if (!data || Object.keys(data).length === 0) return;

        if (document.getElementById("heartRate"))
            document.getElementById("heartRate").innerText =
                (data.heartRate ?? data.heart_rate ?? "--") + " BPM";

        if (document.getElementById("spo2"))
            document.getElementById("spo2").innerText =
                (data.spo2 ?? "--") + " %";

        if (document.getElementById("bodyTemp"))
            document.getElementById("bodyTemp").innerText =
                (data.bodyTemp ?? data.body_temp ?? "--") + " °C";

        if (document.getElementById("nox"))
            document.getElementById("nox").innerText =
                (data.nox ?? "--") + " ppm";

        if (document.getElementById("pm25"))
            document.getElementById("pm25").innerText =
                (data.pm25 ?? "--") + " μg/m³";

        if (document.getElementById("airTemp"))
            document.getElementById("airTemp").innerText =
                (data.airTemp ?? data.air_temp ?? "--") + " °C";

        if (document.getElementById("humidity"))
            document.getElementById("humidity").innerText =
                (data.humidity ?? "--") + " %";

    } catch (err) {

        console.error("Sensor update error:", err);

    }
}

async function openChart(sensor) {

    const patientCode = getCurrentPatientCode();

    if (!patientCode) {
        alert("Please select a patient or log in as a patient account.");
        return;
    }

    document.getElementById("chartTitle").innerText = sensor;

    modal.style.display = "block";

    try {

        const response = await fetch(`/api/history/${patientCode}`);
        const rows = await response.json();

        if (!Array.isArray(rows) || rows.length === 0) {

            if (chartInstance) chartInstance.destroy();

            console.warn("No historical data available");

            return;
        }

        const recentRows = rows.slice(0, 20);
        recentRows.reverse();

        const chartData = recentRows.map(row => {

            if (sensor === "heartRate")
                return row.heartRate ?? row.heart_rate;

            if (sensor === "bodyTemp")
                return row.bodyTemp ?? row.body_temp;

            if (sensor === "airTemp")
                return row.airTemp ?? row.air_temp;

            return row[sensor];

        });

        const chartLabels = recentRows.map((row, index) =>
            row.timestamp || row.created_at || index + 1
        );

        const ctx = document.getElementById("sensorChart");

        if (chartInstance) {
            chartInstance.destroy();
        }

        chartInstance = new Chart(ctx, {
            type: "line",
            data: {
                labels: chartLabels,
                datasets: [{
                    label: sensor,
                    data: chartData,
                    borderColor: "#2196f3",
                    borderWidth: 3,
                    tension: 0.4,
                    fill: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });

    } catch (err) {

        console.error("Chart loading error:", err);

    }
}


document.querySelectorAll(".sensor-card").forEach(card => {

    card.addEventListener("click", () => {
        openChart(card.dataset.sensor);
    });

});

closeBtn.onclick = () => {
    modal.style.display = "none";
};

window.onclick = (e) => {

    if (e.target === modal) {
        modal.style.display = "none";
    }

};

// =========================
// ADVICE MODAL
// =========================

const adviceModal = document.getElementById("adviceModal");

async function loadAdviceData(patientCode) {
    try {
        const res  = await fetch(`/api/advice/${patientCode}`);
        const data = await res.json();
        document.getElementById("doctorAdvice").innerText =
            data.content || "No advice from doctor yet";
    } catch {
        document.getElementById("doctorAdvice").innerText = "Error loading data";
    }
}

document.getElementById("saveAdviceBtn")?.addEventListener("click", async () => {
    const patientCode = document.getElementById("patientCode").value.trim();
    const content     = document.getElementById("adviceText").value.trim();
    const doctorId    = localStorage.getItem("username");

    if (!patientCode) {
        alert("Please select a patient!");
        return;
    }
    if (!content) {
        alert("Please enter advice!");
        return;
    }

    try {
        const res  = await fetch(`/api/advice/${patientCode}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ doctor_id: doctorId, content })
        });
        const data = await res.json();

        if (data.success) {
            alert("Advice saved successfully!");
            document.getElementById("doctorAdvice").innerText = content;
            document.getElementById("adviceText").value       = "";
        } else {
            alert("Save failed!");
        }
    } catch (err) {
        console.error(err);
        alert("Server error!");
    }
});

document.getElementById("loadAdviceBtn")?.addEventListener("click", () => {
    const patientCode = document.getElementById("patientCode").value.trim();
    if (!patientCode) {
        alert("No patient code found!");
        return;
    }
    loadAdviceData(patientCode);
});

document.getElementById("openAdviceModal").addEventListener("click", () => {
    adviceModal.style.display = "block";

    const role             = localStorage.getItem("role");
    const patientCodeInput = document.getElementById("patientCode");
    const suggestionsList  = document.getElementById("patientSuggestions");
    const doctorEditor     = document.getElementById("doctorEditor");

    if (doctorEditor) {
        doctorEditor.style.display =
            (role === "doctor" || role === "admin") ? "block" : "none";
    }

    if (role === "patient") {
        const code = localStorage.getItem("patientCode") || "";
        patientCodeInput.value            = code;
        patientCodeInput.readOnly         = true;
        patientCodeInput.style.background = "#f0f0f0";
        patientCodeInput.style.cursor     = "not-allowed";
        patientCodeInput.style.color      = "#888";

        if (code) loadAdviceData(code);

    } else if (role === "doctor" || role === "admin") {
        patientCodeInput.value            = "";
        patientCodeInput.readOnly         = false;
        patientCodeInput.style.background = "";
        patientCodeInput.style.cursor     = "";
        patientCodeInput.style.color      = "";

        const fresh = patientCodeInput.cloneNode(true);
        patientCodeInput.parentNode.replaceChild(fresh, patientCodeInput);
        const input = document.getElementById("patientCode");

        function positionDropdown() {
            const rect = input.getBoundingClientRect();
            suggestionsList.style.left = rect.left + "px";
            suggestionsList.style.top = (rect.bottom + 4) + "px";
            suggestionsList.style.width = rect.width + "px";
        }

        function renderPatientList(list) {
            suggestionsList.innerHTML = "";
            if (list.length === 0) {
                suggestionsList.style.display = "none";
                return;
            }
            list.forEach(p => {
                const li = document.createElement("li");
                li.textContent = `${p.patient_code} — ${p.first_name} ${p.last_name}`;
                li.style.cssText =
                    "padding:10px 14px; cursor:pointer; font-size:14px; border-bottom:1px solid #eee;";
                li.addEventListener("mouseenter", () => li.style.background = "#f5f5f5");
                li.addEventListener("mouseleave", () => li.style.background = "");
                li.addEventListener("click", () => {
                    input.value = p.patient_code;
                    suggestionsList.style.display = "none";
                    loadAdviceData(p.patient_code);
                });
                suggestionsList.appendChild(li);
            });
            positionDropdown();
            suggestionsList.style.display = "block";
        }

        fetch("/api/patients")
            .then(res => res.json())
            .then(patients => {
                if (patients.length > 0) {
                    renderPatientList(patients);
                }

                input.addEventListener("focus", () => {
                    if (patients.length > 0) {
                        renderPatientList(patients);
                    }
                });

                input.addEventListener("input", () => {
                    const keyword = input.value.trim().toLowerCase();
                    if (!keyword) {
                        renderPatientList(patients);
                        return;
                    }
                    const matched = patients.filter(p =>
                        (p.patient_code?.toLowerCase().includes(keyword)) ||
                        (p.first_name?.toLowerCase().includes(keyword)) ||
                        (p.last_name?.toLowerCase().includes(keyword)) ||
                        (p.username?.toLowerCase().includes(keyword))
                    );
                    renderPatientList(matched);
                });
            })
            .catch(err => console.error("Failed to load patient list", err));

        document.addEventListener("click", (e) => {
            const inp = document.getElementById("patientCode");
            if (inp && suggestionsList &&
                !inp.contains(e.target) &&
                !suggestionsList.contains(e.target)) {
                suggestionsList.style.display = "none";
            }
        });

        adviceModal.addEventListener("scroll", () => {
            suggestionsList.style.display = "none";
        });
    }
});

document.getElementById("closeAdviceModal").addEventListener("click", () => {
    adviceModal.style.display = "none";
});

// =========================
// AI ANALYSIS
// =========================

function markedParse(text) {
    if (!text) return "";
    let html = text
        .replace(/^### (.+)$/gm, "<h4>$1</h4>")
        .replace(/^## (.+)$/gm, "<h3>$1</h3>")
        .replace(/^# (.+)$/gm, "<h2>$1</h2>")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/^\* (.+)$/gm, "<li>$1</li>")
        .replace(/\n/g, "<br>");
    return html;
}

function getTodayStr() {
    const d = new Date();
    return d.toISOString().split("T")[0];
}

function getYesterdayStr() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
}

let analysisCurrentPage = 1;

function setAnalysisStatus(msg, isError) {
    const el = document.getElementById("analysisStatus");
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? "#dc3545" : "#666";
}

async function loadAnalysisList(patientCode, page = 1) {
    analysisCurrentPage = page;
    const listEl = document.getElementById("analysisList");
    const paginationEl = document.getElementById("analysisPagination");
    if (!patientCode) {
        listEl.innerHTML = '<p class="placeholder-text">No analysis available.</p>';
        if (paginationEl) paginationEl.style.display = "none";
        return;
    }
    try {
        const res = await fetch(`/api/analysis/list/${encodeURIComponent(patientCode)}?page=${page}&limit=5`);
        const data = await res.json();

        if (!data.analyses || data.analyses.length === 0) {
            listEl.innerHTML = '<p class="placeholder-text">No analysis available. Select a date and generate one below.</p>';
            if (paginationEl) paginationEl.style.display = "none";
            return;
        }

        listEl.innerHTML = data.analyses.map(a => {
            const dateLabel = a.date || "";
            const pointsLabel = a.data_points ?? 0;
            const timeAgo = a.created_at ? new Date(a.created_at).toLocaleString("en-US") : "";
            const contentHtml = markedParse(a.analysis);
            return `
                <div class="analysis-entry">
                    <div class="analysis-entry-header">
                        <span class="meta-badge">📊 ${dateLabel} &middot; ${pointsLabel} readings &middot; ${timeAgo}</span>
                        <button class="analysis-entry-toggle">▲ Collapse</button>
                    </div>
                    <div class="analysis-entry-content">${contentHtml}</div>
                </div>
            `;
        }).join("");

        listEl.querySelectorAll(".analysis-entry").forEach(entry => {
            const toggle = entry.querySelector(".analysis-entry-toggle");
            const content = entry.querySelector(".analysis-entry-content");
            toggle.addEventListener("click", () => {
                const isCollapsed = content.classList.toggle("collapsed");
                toggle.textContent = isCollapsed ? "▼ Expand" : "▲ Collapse";
            });
        });

        if (paginationEl) {
            paginationEl.style.display = "flex";
            document.getElementById("pageIndicator").textContent = `Page ${data.page} of ${data.totalPages}`;
            document.getElementById("prevPageBtn").disabled = data.page <= 1;
            document.getElementById("nextPageBtn").disabled = data.page >= data.totalPages;
        }
    } catch (err) {
        console.error("Failed to load analysis list:", err);
        listEl.innerHTML = '<p class="placeholder-text">Error loading analysis.</p>';
        if (paginationEl) paginationEl.style.display = "none";
    }
}

async function generateAnalysis(patientCode, date) {
    const btn = document.getElementById("analyzeDateBtn");
    const btn2 = document.getElementById("analyzeYesterdayBtn");
    btn.disabled = true;
    btn2.disabled = true;
    btn.textContent = "Analyzing...";
    setAnalysisStatus("Generating AI analysis...", false);

    try {
        const res = await fetch("/api/analysis/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ patient_code: patientCode, date }),
        });
        const data = await res.json();

        if (data.success) {
            setAnalysisStatus("Analysis complete!", false);
            await loadAnalysisList(patientCode, 1);
        } else {
            setAnalysisStatus(data.error || "Analysis failed.", true);
        }
    } catch (err) {
        setAnalysisStatus("Server error while generating analysis.", true);
    } finally {
        btn.disabled = false;
        btn2.disabled = false;
        btn.textContent = "Analyze Selected Date";
    }
}

document.getElementById("analyzeDateBtn")?.addEventListener("click", () => {
    const patientCode = getCurrentPatientCode();
    const date = document.getElementById("analysisDate").value;
    if (!patientCode) {
        alert("Please select a patient first.");
        return;
    }
    if (!date) {
        alert("Please select a date.");
        return;
    }
    generateAnalysis(patientCode, date);
});

document.getElementById("analyzeYesterdayBtn")?.addEventListener("click", () => {
    const patientCode = getCurrentPatientCode();
    if (!patientCode) {
        alert("Please select a patient first.");
        return;
    }
    const yesterday = getYesterdayStr();
    document.getElementById("analysisDate").value = yesterday;
    generateAnalysis(patientCode, yesterday);
});

document.getElementById("prevPageBtn")?.addEventListener("click", () => {
    const patientCode = getCurrentPatientCode();
    if (patientCode) loadAnalysisList(patientCode, analysisCurrentPage - 1);
});

document.getElementById("nextPageBtn")?.addEventListener("click", () => {
    const patientCode = getCurrentPatientCode();
    if (patientCode) loadAnalysisList(patientCode, analysisCurrentPage + 1);
});

document.getElementById("openAdviceModal").addEventListener("click", () => {
    const role = localStorage.getItem("role");
    const patientCode = getCurrentPatientCode();
    if (role === "patient" && patientCode) {
        loadAnalysisList(patientCode, 1);
    }
    const dateInput = document.getElementById("analysisDate");
    if (dateInput) dateInput.value = getYesterdayStr();
});

updateSensorData();
setInterval(updateSensorData, 3000);

// =========================
// AI ANALYSIS
// =========================

async function loadAiAnalysis() {
    const patientCode = getCurrentPatientCode();
    const box = document.getElementById("aiAnalysis");
    if (!box) return;

    if (!patientCode) {
        box.innerHTML = "No analysis data available";
        return;
    }

    try {
        const res  = await fetch(`/api/analysis/${patientCode}`);
        const data = await res.json();

        if (!data || !data.summary) {
            box.innerHTML = "No analysis data available";
            return;
        }

        box.innerHTML = `
            <p><b>${data.summary}</b></p>
            ${data.detail ? `<p style="color:#666;font-size:14px;">${data.detail}</p>` : ""}
            <small style="color:#999;">Cập nhật: ${data.analysis_date || ""}</small>
        `;

    } catch (err) {
        console.error("AI analysis load error:", err);
        box.innerHTML = "Error loading analysis";
    }
}

loadAiAnalysis();
setInterval(loadAiAnalysis, 60000);