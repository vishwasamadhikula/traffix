# OpenCV is required at runtime; some editor environments do not have it installed in the active interpreter.
import cv2  # type: ignore[reportMissingImports]
import requests
import time
import math
from ultralytics import YOLO
from flask import Flask, Response
from flask_cors import CORS

# --- SYSTEM CONFIGURATION ---
NODE_SERVER_URL = "http://127.0.0.1:5000/api/v1/intersections/Junc-01/telemetry"
LANE_ID = "main_forward"

PIXEL_TO_METER_RATIO = 0.0015  
MODEL_SCALE = 80.0             
SPEED_LIMIT = 70.0             

track_history = {}
app = Flask(__name__)
CORS(app)

def generate_frames():
    print("========================================")
    print("⚡ TrafiX AI: MAX-FPS MOTION TRACKING")
    print("========================================")
    
    model = YOLO("yolov8n.pt") 
    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
    
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    
    # Minimal buffer so we process the absolute newest frame instantly
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1) 

    last_send_time = time.time()
    broadcast_interval = 3.0 

    while True:
        ret, frame = cap.read()
        if not ret:
            continue

        current_time = time.time()

        # 1. NO FRAME SKIPPING. Process every single frame so the tracker doesn't lose the object.
        # 2. ADDED iou=0.3 -> Makes the tracker more forgiving when tracking fast-moving blurry objects.
        results = model.track(
            frame, 
            persist=True, 
            conf=0.10,  # Extremely low confidence to catch blurred foam
            iou=0.3,    # High tracking forgiveness
            imgsz=640, 
            verbose=False
        )
        
        vehicle_count = 0
        current_frame_speeds = []

        if results[0].boxes is not None and results[0].boxes.id is not None:
            boxes = results[0].boxes.xyxy.cpu().numpy()
            track_ids = results[0].boxes.id.int().cpu().numpy()
            class_ids = results[0].boxes.cls.int().cpu().numpy()

            for box, track_id, class_id in zip(boxes, track_ids, class_ids):
                x1, y1, x2, y2 = box
                cx, cy = int((x1 + x2) / 2), int((y1 + y2) / 2)
                calculated_speed = 0.0

                if track_id in track_history:
                    prev_cx, prev_cy, prev_time, prev_speed = track_history[track_id]
                    dt = current_time - prev_time

                    if dt > 0.03: 
                        pixel_distance = math.sqrt((cx - prev_cx)**2 + (cy - prev_cy)**2)
                        distance_meters = pixel_distance * PIXEL_TO_METER_RATIO
                        raw_speed_kmh = (distance_meters / dt) * 3.6 * MODEL_SCALE
                        calculated_speed = (0.4 * raw_speed_kmh) + (0.6 * prev_speed)
                        
                        if pixel_distance < 2:
                            calculated_speed = 0.0
                
                track_history[track_id] = (cx, cy, current_time, calculated_speed)
                current_frame_speeds.append(calculated_speed)
                vehicle_count += 1

                # Force everything to be labeled as a toy car
                display_name = "car (toy)"

                is_violating = calculated_speed > SPEED_LIMIT
                box_color = (0, 0, 255) if is_violating else (0, 255, 0) 
                
                cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), box_color, 2)
                cv2.circle(frame, (cx, cy), 4, (0, 0, 255), -1)
                
                label = f"{display_name} #{track_id} | {int(calculated_speed)} km/h"
                cv2.putText(frame, label, (int(x1), int(y1) - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, box_color, 2)

        if current_time - last_send_time > broadcast_interval:
            max_speed = max(current_frame_speeds) if current_frame_speeds else 0
            payload = {"lane": LANE_ID, "vehicleCount": vehicle_count, "speed": round(max_speed, 1)}
            try:
                requests.post(NODE_SERVER_URL, json=payload, timeout=1)
            except requests.exceptions.RequestException:
                pass
            last_send_time = time.time()

        ret, buffer = cv2.imencode('.jpg', frame)
        frame_bytes = buffer.tobytes()

        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

if __name__ == "__main__":
    print("🌐 Flask Video Server running on http://127.0.0.1:5002/video_feed")
    app.run(host='0.0.0.0', port=5002, debug=False, threaded=True)