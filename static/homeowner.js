async function loadHomeownerAlerts() {
    const response = await fetch("/api/incidents");
    const incidents = await response.json();
    const activeIncidents = incidents.filter(
        incident => incident.status !== "RESOLVED"
    );
    const activeFires = activeIncidents.filter(
        incident => incident.hazard_type === "FIRE"
    );

    document.getElementById("fire-count").textContent = activeFires.length;
    document.getElementById("last-updated").textContent = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });

    const status = document.getElementById("safety-status");
    const message = document.getElementById("safety-message");

    if (activeFires.length) {
        status.textContent = "Alert in your area";
        status.className = "status-alert";
        message.textContent = "Please follow BFP instructions and move away from danger.";
    } else {
        status.textContent = "No active fire alerts";
        status.className = "status-clear";
        message.textContent = "Your area is currently clear according to the monitoring network.";
    }

    const alertsList = document.getElementById("alerts-list");

    if (!activeIncidents.length) {
        alertsList.innerHTML = '<p class="empty-state">No active alerts in your area.</p>';
        return;
    }

    alertsList.innerHTML = activeIncidents.map(incident => `
        <article class="alert-item ${incident.hazard_type.toLowerCase()}">
            <div class="alert-icon">${incident.hazard_type === "FIRE" ? "!" : "i"}</div>
            <div>
                <strong>${incident.hazard_type === "FIRE" ? "Fire alert" : "Gas alert"}</strong>
                <p>${incident.address}</p>
                <small>${incident.severity} priority · ${new Date(incident.created_at).toLocaleString()}</small>
            </div>
        </article>
    `).join("");
}

loadHomeownerAlerts().catch(() => {
    document.getElementById("safety-status").textContent = "Updates unavailable";
    document.getElementById("safety-message").textContent = "Please check again shortly and follow local emergency guidance.";
});

setInterval(() => {
    loadHomeownerAlerts().catch(() => {});
}, 5000);


let cameraStream = null;

const cameraFeed = document.getElementById("camera-feed");
const cameraPlaceholder = document.getElementById("camera-placeholder");
const cameraStatus = document.getElementById("camera-status");
const cameraMessage = document.getElementById("camera-message");
const cameraStart = document.getElementById("camera-start");
const cameraStop = document.getElementById("camera-stop");


function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }

    cameraFeed.srcObject = null;
    cameraFeed.classList.remove("is-live");
    cameraPlaceholder.hidden = false;
    cameraStatus.textContent = "OFFLINE";
    cameraStatus.className = "camera-badge";
    cameraMessage.textContent = "Camera access stays on this device.";
    cameraStart.disabled = false;
    cameraStop.disabled = true;
}


async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        cameraMessage.textContent = "Live camera preview is not supported in this browser.";
        return;
    }

    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
            audio: false
        });
        cameraFeed.srcObject = cameraStream;
        cameraFeed.classList.add("is-live");
        cameraPlaceholder.hidden = true;
        cameraStatus.textContent = "LIVE";
        cameraStatus.className = "camera-badge camera-live";
        cameraMessage.textContent = "Live preview is visible only on this device.";
        cameraStart.disabled = true;
        cameraStop.disabled = false;
    } catch (error) {
        cameraMessage.textContent = "Camera access was not granted. Check your browser permissions.";
    }
}


cameraStart.addEventListener("click", startCamera);
cameraStop.addEventListener("click", stopCamera);
window.addEventListener("beforeunload", stopCamera);
