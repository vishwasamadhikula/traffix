# 🚥 TrafiX: Intelligent Traffic Management System

![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![NodeJS](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)
![Python](https://img.shields.io/badge/python-3670A0?style=for-the-badge&logo=python&logoColor=ffdd54)
![Postgres](https://img.shields.io/badge/postgres-%23316192.svg?style=for-the-badge&logo=postgresql&logoColor=white)
![Espressif](https://img.shields.io/badge/espressif-E7352C.svg?style=for-the-badge&logo=espressif&logoColor=white)

TrafiX is an advanced, centralized traffic management and automated law enforcement platform designed to resolve urban traffic congestion and inefficiencies. By integrating Internet of Things (IoT) edge capture modules with an intelligent Python-based Machine Learning optimization engine, TrafiX synchronizes intersection signal timings dynamically while automating speed detection and violation tracking.

## ✨ Key Features

* **🧠 Dynamic 6-Stage Signal Optimization:** Real-time ML algorithms adjust green durations independently across a 6-stage flow based on live lane densities to eliminate idle time.
* **🚨 Automated Infraction Capture:** Edge computer vision sensors capture rule-breakers (>60km/h), calculate fines, and seamlessly populate a digital violation inbox with complete historical tracking.
* **📊 Interactive Admin Dashboard:** A high-contrast React console providing a full-width visual top-down junction schematic, live animated density bars, and edge vision video feeds.
* **🕹️ Manual Hardware Overrides:** Emergency interactive controls that bypass the AI timer, instantly forcing specific lanes green and syncing directly to the physical ESP32 edge hardware in sub-second time.

## 🏗️ 4-Tier Microservice Architecture

TrafiX is built on a highly scalable, decoupled 4-tier architecture to ensure fault tolerance and clean separation of concerns:

1. **Presentation Tier (Client/UI):** Responsive React SPA (Vite) rendering the console, active violation inbox, and live visual schematic.
2. **Application Tier (Integration/Web):** Node.js server (Express/Socket.io) managing REST endpoints, persistent WebSockets, authentication, and sub-second ESP32 hardware polling.
3. **Processing Tier (Business/Analytics):** Dedicated Python/Flask ML Engine operating as an independent microservice to crunch real-time density mathematics and calculate bounded linear cycle scaling.
4. **Data Tier (Storage):** PostgreSQL database handling relational schema mapping for system administrators, telemetry logs, and joined infraction histories.

## 🛠️ Technology Stack

* **Frontend:** React.js, Vite, Axios, Socket.io-client, Custom CSS (Dark Theme)
* **Backend:** Node.js, Express.js, Socket.io
* **Machine Learning Engine:** Python 3, Flask, Flask-CORS
* **Database:** PostgreSQL
* **Hardware / IoT:** ESP32, ESP32-CAM, Custom 17-Pin LED Array (Common Ground Bus, 270Ω Resistor Protected)

## ⚙️ Edge Hardware Setup

The physical intersection prototype operates via an ESP32 microcontroller acting as the central hub:
* **Pin Mapping:** 16 dedicated GPIO pins controlling independent Red and Green states for Straight and Right turns across 4 lanes.
* **Yield State:** 1 shared GPIO pin controlling all Left Turn Yield states simultaneously.
* **Polling:** The ESP32 utilizes a sub-second HTTP polling loop to fetch the active phase from the Node.js application tier and immediately write to the physical LED GPIOs.

## 🚀 Getting Started

### Prerequisites
* Node.js (v16+)
* Python (3.8+)
* PostgreSQL
* Arduino IDE (for ESP32 firmware)

### Installation

**1. Clone the Repository:**
```bash```
```git clone [https://github.com/yourusername/TrafiX.git](https://github.com/yourusername/TrafiX.git)```
```cd TrafiX```

**2. Setup Data Tier (PostgreSQL):**
Ensure PostgreSQL is running on your machine. The Node.js application will automatically initialize the vehicle_logs and fines tables on boot.

**3. Setup Application Tier (Node.js Backend):**

```Bash```
```cd backend```
```npm install```
```npm start```
(Runs on http://localhost:5000)

**4. Setup Processing Tier (Python ML Engine):**

```Bash```
```cd ml-engine```
```pip install -r requirements.txt```
```python app.py```
(Runs on http://localhost:5001)

**5. Setup Presentation Tier (React Frontend):**

```Bash```
```cd frontend```
```npm install```
```npm run dev```
(Runs on http://localhost:5173)

🎓 Academic Context & Team
This system was developed as a Final Project by Group 15 at the Department of Information and Communication Technology, Faculty of Technology, University of Sri Jayewardenepura (August 2026).

Development Team:

W.M.V.D. Weerakoon

D.I.M.E. Kumara

W.A.S.G. Gunerathne

H.N.N. Munesinghe

D.M.V. Samadhikula

Academic Supervisor:
Ms. K.K. Upeksha
