from flask import Flask, render_template, jsonify, request, redirect, url_for, session, Response
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from picamera2 import Picamera2
import cv2
import time
import os
import uuid


# ==========================================
# FIREGUARD FLASK APPLICATION
# ==========================================

app = Flask(__name__)
app.secret_key = os.environ.get("FIREGUARD_SECRET_KEY", "fireguard-development-key")


# ==========================================
# DATABASE CONFIGURATION
# ==========================================

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

app.config["SQLALCHEMY_DATABASE_URI"] = (
    "sqlite:///" + os.path.join(BASE_DIR, "fireguard.db")
)

app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)


# ==========================================
# CAMERA MODULE 3
# ==========================================

camera = Picamera2()

camera_config = camera.create_video_configuration(
    main={"size": (1280, 720), "format": "RGB888"}
)

camera.configure(camera_config)
camera.start()

time.sleep(2)


# ==========================================
# LIVE CAMERA STREAM
# ==========================================

def generate_frames():

    while True:

        frame = camera.capture_array()

        frame = cv2.cvtColor(
            frame,
            cv2.COLOR_RGB2BGR
        )

        success, buffer = cv2.imencode(
            ".jpg",
            frame
        )

        if not success:
            continue

        frame_bytes = buffer.tobytes()

        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n"
            + frame_bytes +
            b"\r\n"
        )


@app.route("/video_feed")
def video_feed():

    return Response(
        generate_frames(),
        mimetype="multipart/x-mixed-replace; boundary=frame"
    )


# ==========================================
# INCIDENT DATABASE
# ==========================================

class Incident(db.Model):

    id = db.Column(
        db.Integer,
        primary_key=True
    )

    incident_id = db.Column(
        db.String(50),
        unique=True,
        nullable=False
    )

    hazard_type = db.Column(
        db.String(50),
        nullable=False
    )

    severity = db.Column(
        db.String(50),
        nullable=False
    )

    sensor = db.Column(
        db.String(100),
        nullable=False
    )

    sensor_value = db.Column(
        db.Float
    )

    device_id = db.Column(
        db.String(50),
        nullable=False
    )

    address = db.Column(
        db.String(255),
        nullable=False
    )

    latitude = db.Column(
        db.Float,
        nullable=False
    )

    longitude = db.Column(
        db.Float,
        nullable=False
    )

    status = db.Column(
        db.String(50),
        default="NEW"
    )

    created_at = db.Column(
        db.DateTime,
        default=datetime.utcnow
    )


# ==========================================
# BFP DASHBOARD
# ==========================================

@app.route("/", methods=["GET", "POST"])
def login():

    if request.method == "POST":

        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")

        expected_username = os.environ.get("FIREGUARD_USERNAME", "admin")
        expected_password = os.environ.get("FIREGUARD_PASSWORD", "fireguard")
        homeowner_username = os.environ.get(
            "FIREGUARD_HOMEOWNER_USERNAME",
            "homeowner"
        )
        homeowner_password = os.environ.get(
            "FIREGUARD_HOMEOWNER_PASSWORD",
            "fireguard"
        )

        if username == expected_username and password == expected_password:

            session["authenticated"] = True
            session["role"] = "bfp"

            return redirect(url_for("dashboard"))

        if username == homeowner_username and password == homeowner_password:

            session["authenticated"] = True
            session["role"] = "homeowner"

            return redirect(url_for("homeowner_dashboard"))

        return render_template(
            "login.html",
            error="The username or password is incorrect."
        ), 401

    if session.get("authenticated") and session.get("role") == "homeowner":

        return redirect(url_for("homeowner_dashboard"))

    if session.get("authenticated"):

        return redirect(url_for("dashboard"))

    return render_template("login.html")


@app.route("/dashboard")
def dashboard():

    if (
        not session.get("authenticated") or
        session.get("role") != "bfp"
    ):

        return redirect(url_for("login"))

    incidents = (
        Incident.query
        .order_by(
            Incident.created_at.desc()
        )
        .all()
    )

    return render_template(
        "dashboard.html",
        incidents=incidents
    )


@app.route("/homeowner")
def homeowner_dashboard():

    if (
        not session.get("authenticated") or
        session.get("role") != "homeowner"
    ):

        return redirect(url_for("login"))

    return render_template("homeowner.html")


@app.route("/camera")
def camera_page():

    if not session.get("authenticated"):
        return redirect(url_for("login"))

    return render_template("camera.html")


@app.route("/logout")
def logout():

    session.clear()

    return redirect(url_for("login"))


@app.route("/video_feed")
def video_feed():

    if not camera_available:
        return Response(
            "Camera unavailable.",
            mimetype="text/plain",
            status=503
        )

    return Response(
        generate_frames(),
        mimetype="multipart/x-mixed-replace; boundary=frame"
    )


# ==========================================
# API - GET INCIDENTS
# ==========================================

@app.route("/api/incidents")
def get_incidents():

    incidents = (
        Incident.query
        .order_by(
            Incident.created_at.desc()
        )
        .all()
    )

    data = []

    for incident in incidents:

        data.append({

            "id": incident.id,

            "incident_id":
                incident.incident_id,

            "hazard_type":
                incident.hazard_type,

            "severity":
                incident.severity,

            "sensor":
                incident.sensor,

            "sensor_value":
                incident.sensor_value,

            "device_id":
                incident.device_id,

            "address":
                incident.address,

            "latitude":
                incident.latitude,

            "longitude":
                incident.longitude,

            "status":
                incident.status,

            "created_at":
                incident.created_at.isoformat()
        })

    return jsonify(data)


# ==========================================
# RESOLVE FIRE INCIDENT
# ==========================================

@app.route("/api/incidents/<int:incident_id>/resolve", methods=["POST"])
def resolve_incident(incident_id):

    if not session.get("authenticated"):

        return jsonify({
            "success": False,
            "message": "Authentication required."
        }), 401

    incident = db.session.get(Incident, incident_id)

    if incident is None:

        return jsonify({
            "success": False,
            "message": "Incident not found."
        }), 404

    if incident.hazard_type != "FIRE":

        return jsonify({
            "success": False,
            "message": "Only fire incidents can be resolved here."
        }), 400

    incident.status = "RESOLVED"

    db.session.commit()

    return jsonify({
        "success": True,
        "message": "Fire marked as extinguished.",
        "status": incident.status
    })


# ==========================================
# TEST FIRE ALERT
# ==========================================

@app.route("/simulate/fire")
def simulate_fire():

    incident = Incident(

        incident_id=
            "INC-" +
            str(uuid.uuid4())[:8].upper(),

        hazard_type="FIRE",

        severity="HIGH",

        sensor="IR Flame Sensor",

        sensor_value=950,

        device_id="FG-001",

        address=
            "Sto. Tomas, Davao del Norte",

        latitude=7.533,

        longitude=125.623,

        status="NEW"
    )

    db.session.add(incident)

    db.session.commit()

    return jsonify({

        "success": True,

        "message":
            "Fire alert created."

    })


# ==========================================
# TEST GAS ALERT
# ==========================================

@app.route("/simulate/gas")
def simulate_gas():

    incident = Incident(

        incident_id=
            "INC-" +
            str(uuid.uuid4())[:8].upper(),

        hazard_type="GAS",

        severity="HIGH",

        sensor="MQ-2 Gas Sensor",

        sensor_value=850,

        device_id="FG-001",

        address=
            "Sto. Tomas, Davao del Norte",

        latitude=7.533,

        longitude=125.623,

        status="NEW"
    )

    db.session.add(incident)

    db.session.commit()

    return jsonify({

        "success": True,

        "message":
            "Gas alert created."

    })


# ==========================================
# CREATE DATABASE
# ==========================================

with app.app_context():

    db.create_all()


# ==========================================
# START FIREGUARD SERVER
# ==========================================

if __name__ == "__main__":

    app.run(

        debug=True,

        host="0.0.0.0",

        port=5000

    )