from flask import Flask, jsonify, request
from flask_cors import CORS  # 🟢 1. Add this import
import requests
import time
import random

app = Flask(__name__)
CORS(app)  # 🟢 2. Add this line to unlock the security gate

NODE_SERVER_URL = "http://localhost:5000/api/v1/traffic/capture"
# ---------------------------------------------------------
# MODULE 1: OCR & Law Enforcement (Simulated)
# ---------------------------------------------------------
@app.route('/api/v1/ml/process-frame', methods=['POST'])
def process_frame():
    print("📷 [ML Engine] Received frame from intersection camera...")
    time.sleep(1) 

    simulated_speed = random.randint(40, 95)
    simulated_plate = f"WP-ML-{random.randint(1000, 9999)}"

    print(f"🧠 [ML Engine] OCR Analysis Complete -> Plate: {simulated_plate} | Speed: {simulated_speed} km/h")

    payload = {
        "intersectionId": "Junc-01",
        "speed": simulated_speed,
        "licensePlate": simulated_plate,
        "imagePath": "/mock-images/ml-captured.jpg"
    }

    try:
        response = requests.post(NODE_SERVER_URL, json=payload)
        if response.status_code == 201:
            print("✅ [ML Engine] Data successfully forwarded and saved to PostgreSQL!")
            return jsonify({"status": "success", "message": "Frame processed and forwarded"}), 200
        else:
            return jsonify({"status": "error", "message": "Failed to save to database"}), 500
    except requests.exceptions.RequestException as e:
        return jsonify({"status": "error", "message": "Node.js server unreachable"}), 500


# ---------------------------------------------------------
# MODULE 2: Dynamic Signal Optimization (4-Phase Sequential)
# ---------------------------------------------------------
@app.route('/api/v1/ml/optimize-timing', methods=['POST'])
def optimize_timing():
    data = request.get_json() or {}
    
    # 1. Read all 4 lanes
    mf_density = data.get('main_forward', random.randint(0, 30))
    mb_density = data.get('main_backward', random.randint(0, 30))
    cf_density = data.get('cross_forward', random.randint(0, 15))
    cb_density = data.get('cross_backward', random.randint(0, 15))

    # 2. Calculate Base Timings for EACH lane independently
    MIN_TIME = 10
    MAX_TIME = 60
    TIME_PER_VEHICLE = 2.5

    mf_green = min(MIN_TIME + (mf_density * TIME_PER_VEHICLE), MAX_TIME)
    mb_green = min(MIN_TIME + (mb_density * TIME_PER_VEHICLE), MAX_TIME)
    cf_green = min(MIN_TIME + (cf_density * TIME_PER_VEHICLE), MAX_TIME)
    cb_green = min(MIN_TIME + (cb_density * TIME_PER_VEHICLE), MAX_TIME)

    return jsonify({
        "status": "success",
        "intersectionId": data.get('intersectionId', 'Junc-01'),
        "input_density": {
            "main_forward": mf_density,
            "main_backward": mb_density,
            "cross_forward": cf_density,
            "cross_backward": cb_density
        },
        "optimized_timings": {
            "main_forward_green": round(mf_green),
            "main_backward_green": round(mb_green),
            "cross_forward_green": round(cf_green),
            "cross_backward_green": round(cb_green)
        }
    }), 200

if __name__ == '__main__':
    print("🧠 TrafiX ML Engine starting on port 5001...")
    app.run(port=5001, debug=True)