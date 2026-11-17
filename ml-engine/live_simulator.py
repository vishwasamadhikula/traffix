import requests
import time
import random

# Target your Python ML Engine
ML_PROCESS_URL = "http://localhost:5001/api/v1/ml/process-frame"

def start_simulation():
    print("🚀 TrafiX Edge Hardware Simulator Started")
    print("Streaming continuous live demo data to ML Engine... (Press Ctrl+C to stop)\n")
    
    while True:
        # Simulate a random delay between passing cars (e.g., 2 to 8 seconds)
        delay = random.randint(2, 8)
        time.sleep(delay)
        
        print(f"📸 [Camera Simulator] Vehicle detected! Forwarding feed to ML Engine...")
        
        try:
            # Trigger the ML Engine to process the simulated frame
            response = requests.post(ML_PROCESS_URL)
            
            if response.status_code == 200:
                print("✅ ML Engine processed OCR & Speed -> Logged to Dashboard!\n")
            else:
                print("⚠️ ML Engine returned an error.\n")
        except requests.exceptions.ConnectionError:
            print("❌ Could not connect to ML Engine. Is app.py running?")

if __name__ == '__main__':
    start_simulation()