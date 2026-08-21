// ==========================================
// INITIALIZE MAP
// ==========================================

const map = L.map("map").setView(
    [7.533, 125.623],
    13
);

const bfpStation = [7.537, 125.620];

const fireIcon = L.divIcon({
    className: "fire-map-icon",
    html: '<span class="fire-map-light">!</span>',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16]
});

const gasIcon = L.divIcon({
    className: "gas-map-icon",
    html: '<span>!</span>',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14]
});

const stationIcon = L.divIcon({
    className: "bfp-station-icon",
    html: '<span>🚒</span>',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18]
});


L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        attribution:
            "&copy; OpenStreetMap contributors"
    }
).addTo(map);


// Store map layers so each refresh replaces the previous map state.

let mapLayers = [];


function getBearing(from, to) {

    const latitudeDelta = to[0] - from[0];
    const longitudeDelta = to[1] - from[1];

    return Math.atan2(longitudeDelta, latitudeDelta) * 180 / Math.PI;

}


// ==========================================
// LOAD INCIDENTS
// ==========================================

async function loadIncidents() {

    try {

        const response =
            await fetch("/api/incidents");

        const incidents =
            await response.json();


        // Clear old markers

        mapLayers.forEach(
            layer => map.removeLayer(layer)
        );

        mapLayers = [];


        // Counters

        let fireCount = 0;

        let gasCount = 0;

        let highCount = 0;


        // HTML

        let tableHTML = "";

        let alertsHTML = "";


        incidents.forEach(
            incident => {


            // Counters

            if (
                incident.hazard_type === "FIRE"
            ) {

                fireCount++;

            }


            if (
                incident.hazard_type === "GAS"
            ) {

                gasCount++;

            }


            if (
                incident.severity === "HIGH"
            ) {

                highCount++;

            }


            // ==================================
            // MAP MARKER
            // ==================================

            const marker =
                L.marker([
                    incident.latitude,
                    incident.longitude
                ], {
                    icon: incident.hazard_type === "FIRE"
                        ? fireIcon
                        : gasIcon,
                    zIndexOffset: incident.hazard_type === "FIRE"
                        ? 1000
                        : 500
                })
                .addTo(map);


            marker.bindPopup(`

                <strong>
                    ${incident.hazard_type}
                </strong>

                <br>

                Severity:
                ${incident.severity}

                <br>

                Device:
                ${incident.device_id}

                <br>

                Location:
                ${incident.address}

                <br><br>

                Status:
                ${incident.status}

            `);


            mapLayers.push(marker);


            // ==================================
            // ALERT CARD
            // ==================================

            const alertClass =
                incident.hazard_type === "GAS"
                ? "alert gas"
                : "alert";


            alertsHTML += `

                <div class="${alertClass}">

                    <div class="alert-title">

                        ${
                            incident.hazard_type === "FIRE"
                            ? "🔥 FIRE ALERT"
                            : "💨 GAS ALERT"
                        }

                    </div>

                    <div>

                        Severity:
                        <strong>
                            ${incident.severity}
                        </strong>

                    </div>

                    <div class="alert-location">

                        📍
                        ${incident.address}

                    </div>

                    <div class="alert-location">

                        Device:
                        ${incident.device_id}

                    </div>

                </div>

            `;


            // ==================================
            // TABLE
            // ==================================

            tableHTML += `

                <tr>

                    <td>
                        ${incident.incident_id}
                    </td>

                    <td>
                        ${incident.hazard_type}
                    </td>

                    <td class="${incident.severity.toLowerCase()}">
                        ${incident.severity}
                    </td>

                    <td>
                        ${incident.sensor}
                    </td>

                    <td>
                        ${incident.address}
                    </td>

                    <td>
                        ${incident.status}
                    </td>

                    <td>
                        ${
                            new Date(
                                incident.created_at
                            ).toLocaleString()
                        }
                    </td>

                </tr>

            `;

        });


        const activeFire = incidents.find(
            incident =>
                incident.hazard_type === "FIRE" &&
                incident.status !== "RESOLVED"
        );


        if (activeFire) {

            const fireLocation = [
                activeFire.latitude,
                activeFire.longitude
            ];

            const route = L.polyline(
                [bfpStation, fireLocation],
                {
                    color: "#2563eb",
                    weight: 5,
                    opacity: 0.9,
                    dashArray: "12 10",
                    lineCap: "round"
                }
            ).addTo(map);

            const station = L.marker(
                bfpStation,
                { icon: stationIcon, zIndexOffset: 900 }
            ).addTo(map);

            station.bindPopup(
                "<strong>BFP response unit</strong><br>Dispatching to the active fire"
            );

            const routeMidpoint = [
                (bfpStation[0] + fireLocation[0]) / 2,
                (bfpStation[1] + fireLocation[1]) / 2
            ];

            const direction = L.marker(
                routeMidpoint,
                {
                    icon: L.divIcon({
                        className: "route-direction-icon",
                        html: `<span style="transform: rotate(${getBearing(bfpStation, fireLocation) - 90}deg)">➤</span>`,
                        iconSize: [28, 28],
                        iconAnchor: [14, 14]
                    }),
                    zIndexOffset: 800
                }
            ).addTo(map);

            direction.bindTooltip("BFP direction", {
                direction: "top",
                offset: [0, -10]
            });

            mapLayers.push(route, station, direction);

        }


        // ==================================
        // UPDATE DASHBOARD
        // ==================================

        document.getElementById(
            "fire-count"
        ).textContent = fireCount;


        document.getElementById(
            "gas-count"
        ).textContent = gasCount;


        document.getElementById(
            "high-count"
        ).textContent = highCount;


        document.getElementById(
            "alerts-list"
        ).innerHTML =
            alertsHTML ||
            `<div class="no-alerts">
                No active alerts
             </div>`;


        document.getElementById(
            "incident-table"
        ).innerHTML =
            tableHTML;


        // ==================================
        // EMERGENCY BANNER
        // ==================================

        const highIncident =
            incidents.find(
                incident =>
                    incident.severity === "HIGH" &&
                    incident.status !== "RESOLVED"
            );


        const banner =
            document.getElementById(
                "emergency-banner"
            );


        if (highIncident) {

            banner.classList.remove(
                "hidden"
            );


            document.getElementById(
                "banner-message"
            ).textContent =

                `${highIncident.hazard_type}
                 detected at
                 ${highIncident.address}`;

        }

        else {

            banner.classList.add(
                "hidden"
            );

        }


    }

    catch (error) {

        console.error(
            "Error loading incidents:",
            error
        );

    }

}


// ==========================================
// SIMULATE FIRE
// ==========================================

async function simulateFire() {

    const response =
        await fetch(
            "/simulate/fire"
        );


    const data =
        await response.json();


    if (data.success) {

        alert(
            "🔥 HIGH FIRE ALERT CREATED"
        );

        loadIncidents();

    }

}


// ==========================================
// SIMULATE GAS
// ==========================================

async function simulateGas() {

    const response =
        await fetch(
            "/simulate/gas"
        );


    const data =
        await response.json();


    if (data.success) {

        alert(
            "💨 HIGH GAS ALERT CREATED"
        );

        loadIncidents();

    }

}


// ==========================================
// START
// ==========================================

loadIncidents();


// Refresh every 5 seconds

setInterval(
    loadIncidents,
    5000
);