import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import './App.css';

const socket = io('http://localhost:5000');

function App() {
  // --- AUTHENTICATION STATE ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // --- DASHBOARD STATE ---
  const [status, setStatus] = useState(null);
  const [mlData, setMlData] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');

  // --- LIVE EDGE AI STATE ---
  const [liveAiData, setLiveAiData] = useState({
    vehicleCount: 0,
    speed: 0,
    isViolating: false
  });

  // --- 6-STAGE OVERLAP TRAFFIC CONTROLLER ---
  const STAGES = ['MF_LEAD', 'MAIN_OVERLAP', 'MB_LEAD', 'CF_LEAD', 'CROSS_OVERLAP', 'CB_LEAD'];
  const [trafficLight, setTrafficLight] = useState({ phase: 'MF_LEAD', timer: 10 });
  
  const mlDataRef = useRef(mlData);
  const liveAiDataRef = useRef(liveAiData);
  const trafficLightRef = useRef(trafficLight); 

  useEffect(() => { mlDataRef.current = mlData; }, [mlData]);
  useEffect(() => { liveAiDataRef.current = liveAiData; }, [liveAiData]);
  useEffect(() => { trafficLightRef.current = trafficLight; }, [trafficLight]);

  const fetchMLTimings = (mf, mb, cf, cb) => {
    axios.post('http://localhost:5001/api/v1/ml/optimize-timing', {
      intersectionId: "Junc-01",
      main_forward: mf,
      main_backward: mb,
      cross_forward: cf,
      cross_backward: cb
    })
      .then(response => setMlData(response.data))
      .catch(error => console.error("Error fetching ML timings:", error));
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    axios.get('http://localhost:5000/api/v1/intersections/Junc-01/status')
      .then(response => setStatus(response.data))
      .catch(error => console.error("Error fetching status:", error));

    fetchMLTimings(0, 18, 5, 4); 
    
    // --- REALISTIC DENSITY SIMULATOR ---
    const densityInterval = setInterval(() => {
      const phase = trafficLightRef.current.phase;
      const currentData = mlDataRef.current?.input_density || { main_backward: 18, cross_forward: 5, cross_backward: 4 };

      const calculateNextDensity = (laneName, currentCount) => {
        let isGreen = false;
        if (laneName === 'MAIN_FWD' && (phase === 'MF_LEAD' || phase === 'MAIN_OVERLAP')) isGreen = true;
        if (laneName === 'MAIN_BWD' && (phase === 'MAIN_OVERLAP' || phase === 'MB_LEAD')) isGreen = true;
        if (laneName === 'CROSS_FWD' && (phase === 'CF_LEAD' || phase === 'CROSS_OVERLAP')) isGreen = true;
        if (laneName === 'CROSS_BWD' && (phase === 'CROSS_OVERLAP' || phase === 'CB_LEAD')) isGreen = true;
        return isGreen ? Math.max(0, currentCount - Math.floor(Math.random() * 5 + 3)) : Math.min(40, currentCount + Math.floor(Math.random() * 3 + 1));
      };

      fetchMLTimings(
        liveAiDataRef.current.vehicleCount, 
        calculateNextDensity('MAIN_BWD', currentData.main_backward),
        calculateNextDensity('CROSS_FWD', currentData.cross_forward), 
        calculateNextDensity('CROSS_BWD', currentData.cross_backward) 
      );
    }, 5000);

    // --- 6-STAGE CLOCK TICKER ---
    const clockInterval = setInterval(() => {
      setTrafficLight(prev => {
        if (prev.timer <= 1) {
          const currentIndex = STAGES.indexOf(prev.phase);
          const nextPhase = STAGES[(currentIndex + 1) % 6];

          axios.post('http://localhost:5000/api/v1/intersections/Junc-01/phase', { phase: nextPhase })
            .catch(err => console.error("ESP32 Hardware sync failed:", err));

          const data = mlDataRef.current;
          let nextTime = 10;
          
          if (data && data.optimized_timings) {
            const mf_total = data.optimized_timings.main_forward_green || 20;
            const mb_total = data.optimized_timings.main_backward_green || 20;
            const cf_total = data.optimized_timings.cross_forward_green || 14;
            const cb_total = data.optimized_timings.cross_backward_green || 14;

            if (nextPhase === 'MF_LEAD') nextTime = Math.max(5, Math.floor(mf_total * 0.5));
            if (nextPhase === 'MAIN_OVERLAP') nextTime = Math.max(5, Math.floor(mf_total * 0.5));
            if (nextPhase === 'MB_LEAD') nextTime = Math.max(5, Math.floor(mb_total * 0.5));
            if (nextPhase === 'CF_LEAD') nextTime = Math.max(5, Math.floor(cf_total * 0.5));
            if (nextPhase === 'CROSS_OVERLAP') nextTime = Math.max(5, Math.floor(cf_total * 0.5));
            if (nextPhase === 'CB_LEAD') nextTime = Math.max(5, Math.floor(cb_total * 0.5));
          }
          return { phase: nextPhase, timer: nextTime };
        }
        return { ...prev, timer: prev.timer - 1 };
      });
    }, 1000);

    socket.on('trafficUpdate', (newData) => {
      setStatus(newData); 
      if (newData.lane === 'main_forward') {
        setLiveAiData({ vehicleCount: newData.liveVehicleCount || 0, speed: newData.liveSpeed || 0, isViolating: newData.liveSpeed > 60 });
      }
    });

    return () => {
      socket.off('trafficUpdate');
      clearInterval(densityInterval);
      clearInterval(clockInterval);
    };
  }, [isAuthenticated]); 

  const handleManualOverride = (overridePhase) => {
    setTrafficLight({ phase: overridePhase, timer: 15 });
    axios.post('http://localhost:5000/api/v1/intersections/Junc-01/phase', { phase: overridePhase })
      .catch(err => console.error("ESP32 Override sync failed:", err));
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (import.meta.env.VITE_ADMIN_USERNAME &&
        import.meta.env.VITE_ADMIN_PASSWORD &&
        loginUsername === import.meta.env.VITE_ADMIN_USERNAME &&
        loginPassword === import.meta.env.VITE_ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      setLoginError('');
    } else {
      setLoginError('Invalid credentials. Access denied.');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setLoginUsername('');
    setLoginPassword('');
    setActiveTab('dashboard'); 
    setStatus(null); 
    setMlData(null);
  };

  const getDensityVisual = (vehicles) => {
    const maxCapacity = 40; 
    const percentage = Math.min((vehicles / maxCapacity) * 100, 100);
    let colorClass = 'bg-success';
    if (vehicles > 15) colorClass = 'bg-warning';
    if (vehicles > 25) colorClass = 'bg-danger';
    return { width: `${percentage}%`, colorClass };
  };

  const getTurnBreakdown = (totalVehicles) => {
    if (totalVehicles === 0) return { left: 0, straight: 0, right: 0 };
    const left = Math.floor(totalVehicles * 0.20);
    const right = Math.floor(totalVehicles * 0.20);
    return { left, straight: totalVehicles - left - right, right };
  };

  const getLaneState = (lane, stage) => {
    switch (lane) {
      case 'MAIN_FWD':
        if (stage === 'MF_LEAD') return { l: 'G', s: 'G', r: 'G' };
        if (stage === 'MAIN_OVERLAP') return { l: 'G', s: 'G', r: 'R' };
        if (stage === 'MB_LEAD' || stage === 'CF_LEAD') return { l: 'O', s: 'R', r: 'R' };
        return { l: 'R', s: 'R', r: 'R' };
      case 'MAIN_BWD':
        if (stage === 'MAIN_OVERLAP') return { l: 'G', s: 'G', r: 'R' };
        if (stage === 'MB_LEAD') return { l: 'G', s: 'G', r: 'G' };
        if (stage === 'MF_LEAD' || stage === 'CB_LEAD') return { l: 'O', s: 'R', r: 'R' };
        return { l: 'R', s: 'R', r: 'R' };
      case 'CROSS_FWD':
        if (stage === 'CF_LEAD') return { l: 'G', s: 'G', r: 'G' };
        if (stage === 'CROSS_OVERLAP') return { l: 'G', s: 'G', r: 'R' };
        if (stage === 'MB_LEAD' || stage === 'CB_LEAD') return { l: 'O', s: 'R', r: 'R' };
        return { l: 'R', s: 'R', r: 'R' };
      case 'CROSS_BWD':
        if (stage === 'CROSS_OVERLAP') return { l: 'G', s: 'G', r: 'R' };
        if (stage === 'CB_LEAD') return { l: 'G', s: 'G', r: 'G' };
        if (stage === 'MF_LEAD' || stage === 'CF_LEAD') return { l: 'O', s: 'R', r: 'R' };
        return { l: 'R', s: 'R', r: 'R' };
      default: return { l: 'R', s: 'R', r: 'R' };
    }
  };

  const renderMultiLaneLights = (lane, arrows) => {
    const stage = trafficLight.phase;
    const states = getLaneState(lane, stage);
    const segmentData = [{ state: states.l, icon: arrows[0] }, { state: states.s, icon: arrows[1] }, { state: states.r, icon: arrows[2] }];

    return (
      <div style={{ display: 'flex', gap: '6px', width: '100%', marginTop: '15px' }}>
        {segmentData.map((seg, i) => {
          let bgColor = 'rgba(239, 68, 68, 0.1)'; 
          let textColor = '#ef4444';
          let border = '1px solid #ef4444';
          
          if (seg.state === 'G') { bgColor = 'rgba(34, 197, 94, 0.1)'; textColor = '#22c55e'; border = '1px solid #22c55e'; } 
          if (seg.state === 'O') { bgColor = 'rgba(234, 179, 8, 0.1)'; textColor = '#eab308'; border = '1px solid #eab308'; } 

          const timeText = seg.state === 'R' ? 'RED' : `${trafficLight.timer}s`;
          
          return (
            <div key={i} style={{ 
              flex: 1, backgroundColor: bgColor, color: textColor, border: border, borderRadius: '8px', 
              padding: '6px 0', textAlign: 'center', fontSize: '0.75rem', fontWeight: 'bold'
            }}>
              <div style={{ fontSize: '1.2rem', marginBottom: '2px' }}>{seg.icon}</div>
              <div>{timeText}</div>
            </div>
          );
        })}
      </div>
    );
  };

  if (!isAuthenticated) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0f172a' }}>
        <div style={{ background: '#1e293b', padding: '40px', borderRadius: '12px', border: '1px solid #334155', color: '#fff', textAlign: 'center', width: '350px' }}>
          <h2 style={{ marginBottom: '5px' }}>🚥 TrafiX Core</h2>
          <p style={{ color: '#94a3b8', marginBottom: '20px' }}>Secure Admin Access</p>
          <form onSubmit={handleLogin}>
            <input type="text" value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} required placeholder="Username" style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '6px', border: '1px solid #334155', background: '#0f172a', color: '#fff' }} />
            <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required placeholder="Password" style={{ width: '100%', padding: '10px', marginBottom: '20px', borderRadius: '6px', border: '1px solid #334155', background: '#0f172a', color: '#fff' }} />
            <button type="submit" style={{ width: '100%', padding: '12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Authenticate</button>
          </form>
        </div>
      </div>
    );
  }

  if (!status || !mlData) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0f172a', color: '#fff' }}><h2>Initializing TrafiX Edge Node...</h2></div>;

  // ⚡ NEW: NOW PULLS FROM THE FULL DATABASE HISTORY INSTEAD OF FILTERING RECENT LOGS ⚡
  const violations = status.recentViolations || [];
  
  const fwdBreakdown = getTurnBreakdown(liveAiData.vehicleCount);
  const bwdBreakdown = getTurnBreakdown(mlData.input_density.main_backward);
  const crossFwdBreakdown = getTurnBreakdown(mlData.input_density.cross_forward);
  const crossBwdBreakdown = getTurnBreakdown(mlData.input_density.cross_backward);

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>🚥 TrafiX</h2>
          <p>Admin Console</p>
        </div>
        <nav className="sidebar-nav">
          <button className={activeTab === 'dashboard' ? 'active' : ''} onClick={() => setActiveTab('dashboard')}>📊 Dashboard</button>
          <button className={activeTab === 'violations' ? 'active' : ''} onClick={() => setActiveTab('violations')}>🚨 Violations ({status.activeAlerts})</button>
        </nav>
        <div className="sidebar-footer">
          <button className="logout-btn" onClick={handleLogout}>🚪 Logout</button>
        </div>
      </aside>

      <main className="main-content">
        <header className="top-header">
          <h1>System Overview: {status.intersectionId}</h1>
          <div className="user-profile">👤 Admin (Admin)</div>
        </header>

        {activeTab === 'dashboard' && (
          <div className="dashboard-grid">
            <div className="stat-card">
              <h3>Traffic Status</h3>
              <div className={`stat-value ${status.trafficDensity === 'High' ? 'text-danger' : 'text-success'}`}>{status.trafficDensity}</div>
            </div>
            <div className="stat-card">
              <h3>Processed Logs</h3>
              <div className="stat-value text-primary">{status.totalLogs}</div>
            </div>
            <div className="stat-card">
              <h3>Fines Generated</h3>
              <div className="stat-value text-warning">LKR {status.activeAlerts * 1500}</div>
            </div>

            {/* --- MASSIVE LIVE VIDEO FEED PANEL --- */}
            <div className="grid-col-span-3 section-card">
              <div className="card-header">
                <h3>📷 Edge Vision Camera: Main Forward</h3>
                <span className="text-primary" style={{ fontWeight: 'bold' }}>Live Data Active</span>
              </div>
              <div className="video-feed-wrapper">
                <div className="live-indicator">
                  <div className="live-dot"></div> LIVE AI TRACKING
                </div>
                <img 
                  src="http://127.0.0.1:5002/video_feed" 
                  alt="Live AI Stream" 
                  style={{ width: '100%', height: 'auto', display: 'block' }} 
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </div>
            </div>

            {/* --- INTERSECTION SCHEMATIC --- */}
            <div className="grid-col-span-3 section-card">
              <div className="card-header">
                <h3>🧠 AI Optimization Schematic</h3>
                <span style={{ padding: '6px 12px', background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6', borderRadius: '6px', fontWeight: 'bold' }}>
                  Stage: {trafficLight.phase.replace('_', ' ')}
                </span>
              </div>
              
              <div className="visual-junction-container">
                <div className="junction-empty"></div>
                
                {/* Main Backward */}
                <div className="road-panel">
                  <h4 style={{ color: '#94a3b8' }}>⬇️ Main (BWD)</h4>
                  <p style={{ fontSize: '1.2rem', fontWeight: 'bold', margin: '10px 0' }}>{mlData.input_density.main_backward} <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Cars</span></p>
                  <div className="density-bar-container"><div className={`density-bar ${getDensityVisual(mlData.input_density.main_backward).colorClass}`} style={{ width: getDensityVisual(mlData.input_density.main_backward).width }}></div></div>
                  <div style={{ display: 'flex', gap: '15px', fontSize: '0.85rem', color: '#94a3b8', marginTop: '5px' }}><span>L: {bwdBreakdown.left}</span><span>S: {bwdBreakdown.straight}</span><span>R: {bwdBreakdown.right}</span></div>
                  {renderMultiLaneLights('MAIN_BWD', ['➡️', '⬇️', '⬅️'])}
                </div>

                <div className="junction-empty"></div>

                {/* Cross Forward */}
                <div className="road-panel">
                  <h4 style={{ color: '#94a3b8' }}>➡️ Cross (FWD)</h4>
                  <p style={{ fontSize: '1.2rem', fontWeight: 'bold', margin: '10px 0' }}>{mlData.input_density.cross_forward} <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Cars</span></p>
                  <div className="density-bar-container"><div className={`density-bar ${getDensityVisual(mlData.input_density.cross_forward).colorClass}`} style={{ width: getDensityVisual(mlData.input_density.cross_forward).width }}></div></div>
                  <div style={{ display: 'flex', gap: '15px', fontSize: '0.85rem', color: '#94a3b8', marginTop: '5px' }}><span>L: {crossFwdBreakdown.left}</span><span>S: {crossFwdBreakdown.straight}</span><span>R: {crossFwdBreakdown.right}</span></div>
                  {renderMultiLaneLights('CROSS_FWD', ['⬆️', '➡️', '⬇️'])}
                </div>

                <div className="center-intersection"></div>

                {/* Cross Backward */}
                <div className="road-panel">
                  <h4 style={{ color: '#94a3b8' }}>⬅️ Cross (BWD)</h4>
                  <p style={{ fontSize: '1.2rem', fontWeight: 'bold', margin: '10px 0' }}>{mlData.input_density.cross_backward} <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Cars</span></p>
                  <div className="density-bar-container"><div className={`density-bar ${getDensityVisual(mlData.input_density.cross_backward).colorClass}`} style={{ width: getDensityVisual(mlData.input_density.cross_backward).width }}></div></div>
                  <div style={{ display: 'flex', gap: '15px', fontSize: '0.85rem', color: '#94a3b8', marginTop: '5px' }}><span>L: {crossBwdBreakdown.left}</span><span>S: {crossBwdBreakdown.straight}</span><span>R: {crossBwdBreakdown.right}</span></div>
                  {renderMultiLaneLights('CROSS_BWD', ['⬇️', '⬅️', '⬆️'])}
                </div>

                <div className="junction-empty"></div>

                {/* Main Forward (LIVE AI) */}
                <div className="road-panel" style={{ border: '1px solid #3b82f6', background: 'rgba(59, 130, 246, 0.05)' }}>
                  <h4 style={{ color: '#3b82f6' }}>⬆️ Main (FWD) - Edge AI</h4>
                  <p style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: '10px 0', color: liveAiData.isViolating ? '#ef4444' : '#fff' }}>
                    {liveAiData.vehicleCount} <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Cars</span> | {liveAiData.speed} <span style={{ fontSize: '0.8rem', color: '#64748b' }}>km/h</span>
                  </p>
                  <div className="density-bar-container"><div className={`density-bar ${getDensityVisual(liveAiData.vehicleCount).colorClass}`} style={{ width: getDensityVisual(liveAiData.vehicleCount).width }}></div></div>
                  <div style={{ display: 'flex', gap: '15px', fontSize: '0.85rem', color: '#94a3b8', marginTop: '5px' }}><span>L: {fwdBreakdown.left}</span><span>S: {fwdBreakdown.straight}</span><span>R: {fwdBreakdown.right}</span></div>
                  {renderMultiLaneLights('MAIN_FWD', ['⬅️', '⬆️', '➡️'])}
                </div>

                <div className="junction-empty"></div>
              </div>
            </div>

            {/* --- MANUAL OVERRIDE CONTROLS --- */}
            <div className="grid-col-span-3 section-card">
              <div className="card-header">
                <h3>🕹️ Manual Override Controls</h3>
                <span style={{ padding: '4px 10px', background: 'rgba(234, 179, 8, 0.1)', color: '#eab308', border: '1px solid rgba(234, 179, 8, 0.3)', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                  Warning: Overrides Edge AI
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px' }}>
                <button 
                  className="primary-btn" 
                  onClick={() => handleManualOverride('MF_LEAD')}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '15px', backgroundColor: trafficLight.phase === 'MF_LEAD' ? '#388bfd' : '#21262d', border: trafficLight.phase === 'MF_LEAD' ? 'none' : '1px solid #30363d', color: trafficLight.phase === 'MF_LEAD' ? '#fff' : '#c9d1d9' }}
                >
                  <span style={{ fontSize: '1.5rem' }}>⬆️</span>
                  Main FWD Straight
                </button>
                <button 
                  className="primary-btn" 
                  onClick={() => handleManualOverride('MB_LEAD')}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '15px', backgroundColor: trafficLight.phase === 'MB_LEAD' ? '#388bfd' : '#21262d', border: trafficLight.phase === 'MB_LEAD' ? 'none' : '1px solid #30363d', color: trafficLight.phase === 'MB_LEAD' ? '#fff' : '#c9d1d9' }}
                >
                  <span style={{ fontSize: '1.5rem' }}>⬇️</span>
                  Main BWD Straight
                </button>
                <button 
                  className="primary-btn" 
                  onClick={() => handleManualOverride('CF_LEAD')}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '15px', backgroundColor: trafficLight.phase === 'CF_LEAD' ? '#388bfd' : '#21262d', border: trafficLight.phase === 'CF_LEAD' ? 'none' : '1px solid #30363d', color: trafficLight.phase === 'CF_LEAD' ? '#fff' : '#c9d1d9' }}
                >
                  <span style={{ fontSize: '1.5rem' }}>➡️</span>
                  Cross FWD Straight
                </button>
                <button 
                  className="primary-btn" 
                  onClick={() => handleManualOverride('CB_LEAD')}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '15px', backgroundColor: trafficLight.phase === 'CB_LEAD' ? '#388bfd' : '#21262d', border: trafficLight.phase === 'CB_LEAD' ? 'none' : '1px solid #30363d', color: trafficLight.phase === 'CB_LEAD' ? '#fff' : '#c9d1d9' }}
                >
                  <span style={{ fontSize: '1.5rem' }}>⬅️</span>
                  Cross BWD Straight
                </button>
              </div>
            </div>

            {/* --- VEHICLE LOG --- */}
            <div className="grid-col-span-3 section-card">
              <div className="card-header">
                <h3>Edge Detection Logs</h3>
              </div>
              <div className="activity-list">
                {status.recentLogs.slice(0, 8).map((log) => (
                  <div key={log.logId} className="activity-item">
                    <div>
                      <strong style={{ display: 'block', marginBottom: '4px' }}>{log.licensePlate}</strong>
                      <span className="time">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className={`speed-badge ${log.speed > 60 ? 'speeding' : 'normal'}`}>
                      {log.speed} km/h
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* ⚡ UPDATED: NOW RENDERS THE FULL HISTORY ARRAY ⚡ */}
        {activeTab === 'violations' && (
          <div className="section-card">
            <div className="card-header">
              <h3>🚨 Active Violations Inbox</h3>
            </div>
            <table className="data-table">
              <thead><tr><th>Time</th><th>License Plate</th><th>Speed</th><th>Fine Amount</th><th>Status</th></tr></thead>
              <tbody>
                {violations.map((log) => (
                  <tr key={log.logId}>
                    <td>{new Date(log.timestamp).toLocaleTimeString()}</td>
                    <td><strong style={{ color: '#fff' }}>{log.licensePlate}</strong></td>
                    <td className="text-danger font-bold">{log.speed} km/h</td>
                    <td>LKR {log.amount || 1500}</td>
                    <td><span style={{ padding: '4px 8px', background: 'rgba(234, 179, 8, 0.2)', color: '#eab308', borderRadius: '4px', fontSize: '0.8rem' }}>{log.status || 'Pending'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;