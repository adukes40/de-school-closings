import React, { useEffect, useState, useRef } from 'react';
import SchoolClosingsMap from './components/SchoolClosingsMap';
import 'leaflet/dist/leaflet.css';
import './App.css';

const POLL_INTERVAL = 3 * 60 * 1000; // re-fetch every 3 minutes

function App() {
  const [closings, setClosings] = useState([]);
  const [closingsByDistrict, setClosingsByDistrict] = useState({});
  const [closingsByVotech, setClosingsByVotech]     = useState({});
  const [closingsByCharter, setClosingsByCharter]   = useState({});
  const [districts, setDistricts]         = useState(null);
  const [votechDistricts, setVotechDistricts] = useState(null);
  const [charterSchools, setCharterSchools]   = useState(null);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const districtsLoadedRef = useRef(false);
  const votechLoadedRef    = useRef(false);
  const charterLoadedRef   = useRef(false);

  useEffect(() => {
    async function loadData() {
      try {
        // Always fetch closings; only fetch static data once
        const fetchPromises = [fetch('/api/closings')];
        const fetchKeys     = ['closings'];

        if (!districtsLoadedRef.current) {
          fetchPromises.push(fetch('/api/districts'));
          fetchKeys.push('districts');
        }
        if (!votechLoadedRef.current) {
          fetchPromises.push(fetch('/api/votech-districts'));
          fetchKeys.push('votech');
        }
        if (!charterLoadedRef.current) {
          fetchPromises.push(fetch('/api/charter-schools'));
          fetchKeys.push('charter');
        }

        const responses = await Promise.all(fetchPromises);

        for (let i = 0; i < fetchKeys.length; i++) {
          if (!responses[i].ok) throw new Error(`API error: ${responses[i].status}`);
          const json = await responses[i].json();
          const key  = fetchKeys[i];

          if (key === 'closings') {
            setClosings(json.closings);
            setClosingsByDistrict(json.byDistrict  || {});
            setClosingsByVotech(json.byVotech      || {});
            setClosingsByCharter(json.byCharter    || {});
            setFetchedAt(json.fetchedAt);
          } else if (key === 'districts') {
            setDistricts(json);
            districtsLoadedRef.current = true;
          } else if (key === 'votech') {
            setVotechDistricts(json);
            votechLoadedRef.current = true;
          } else if (key === 'charter') {
            setCharterSchools(json);
            charterLoadedRef.current = true;
          }
        }

        setLoading(false);
        setError(null);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    }

    loadData();
    const id = setInterval(loadData, POLL_INTERVAL);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return <div className="loading-screen">Loading closings data...</div>;
  }

  if (error) {
    return (
      <div className="error-screen">
        <h2>Error</h2>
        <p>{error}</p>
        <p>Make sure the API server is running: <code>npm run server</code></p>
      </div>
    );
  }

  const closedCount = closings.filter(c => c.statusType === 'closed').length;
  const delayCount  = closings.filter(c => c.statusType === 'delay').length;
  const earlyCount  = closings.filter(c => c.statusType === 'early dismissal').length;
  const infoCount   = closings.filter(c => c.statusType === 'info').length;

  return (
    <div className="app">
      <header className="header">
        <h1 className="header-title">Delaware School Closings</h1>
        <div className="header-right">
          <div className="header-badges">
            {closedCount > 0 && <span className="badge badge-closed">{closedCount} Closed</span>}
            {delayCount  > 0 && <span className="badge badge-delay">{delayCount} Delayed</span>}
            {earlyCount  > 0 && <span className="badge badge-early">{earlyCount} Early Dismissal</span>}
            {infoCount   > 0 && <span className="badge badge-info">{infoCount} Info</span>}
            {closings.length === 0 && <span className="badge badge-open">All Open</span>}
          </div>
          {fetchedAt && (
            <span className="last-updated">
              Updated {new Date(fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </header>

      <div className="map-container">
        {/* Map is always visible — shows open/closed state for all layers */}
        <SchoolClosingsMap
          districts={districts}
          closingsByDistrict={closingsByDistrict}
          votechDistricts={votechDistricts}
          closingsByVotech={closingsByVotech}
          charterSchools={charterSchools}
          closingsByCharter={closingsByCharter}
        />

        {/* Overlay when no closings are active */}
        {closings.length === 0 && (
          <div className="no-closings-overlay">
            <h2>No closings reported</h2>
            <p>All Delaware schools are currently open.</p>
          </div>
        )}

        <div className="legend">
          <div className="legend-section-label">Status</div>
          <div className="legend-item"><span className="legend-swatch" style={{ background: '#ef4444' }} />Closed</div>
          <div className="legend-item"><span className="legend-swatch" style={{ background: '#f59e0b' }} />Delay</div>
          <div className="legend-item"><span className="legend-swatch" style={{ background: '#f97316' }} />Early Dismissal</div>
          <div className="legend-item"><span className="legend-swatch" style={{ background: '#3b82f6' }} />Informational</div>
          <div className="legend-item"><span className="legend-swatch" style={{ background: '#30363d', border: '1px solid #484f58' }} />Open</div>
          <div className="legend-divider" />
          <div className="legend-section-label">Layers</div>
          <div className="legend-item">
            <span className="legend-swatch-icon" style={{ background: '#484f58', border: '1.5px solid rgba(255,255,255,0.6)' }}>
              <svg viewBox="0 0 16 16" width="10" height="10"><path fill="#fff" d="M8 10a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm5.2-1.8-.5-.3a.6.6 0 0 1-.2-.7l.2-.5a1 1 0 0 0-.2-1.1l-.8-.8a1 1 0 0 0-1.1-.2l-.5.2a.6.6 0 0 1-.7-.2l-.3-.5A1 1 0 0 0 8.2 4h-1a1 1 0 0 0-.9.6l-.2.5a.6.6 0 0 1-.7.2l-.5-.2a1 1 0 0 0-1.1.2l-.7.8a1 1 0 0 0-.2 1l.2.6a.6.6 0 0 1-.2.7l-.5.2a1 1 0 0 0-.6.9v1a1 1 0 0 0 .6.9l.5.3a.6.6 0 0 1 .2.7l-.2.5a1 1 0 0 0 .2 1.1l.7.7a1 1 0 0 0 1.1.2l.5-.2a.6.6 0 0 1 .7.2l.3.5a1 1 0 0 0 .9.6h1a1 1 0 0 0 .9-.6l.2-.5a.6.6 0 0 1 .7-.2l.5.2a1 1 0 0 0 1.1-.2l.8-.7a1 1 0 0 0 .2-1.1l-.2-.5a.6.6 0 0 1 .2-.7l.5-.3a1 1 0 0 0 .5-.9v-1a1 1 0 0 0-.5-.8Z"/></svg>
            </span>
            VoTech Districts
          </div>
          <div className="legend-item">
            <span className="legend-swatch-icon" style={{ background: '#484f58', border: '1.5px solid rgba(255,255,255,0.6)' }}>
              <svg viewBox="0 0 16 16" width="10" height="10"><path fill="#fff" d="M2 3.5c1.5-1 3.5-1 5-.5l1 .4 1-.4c1.5-.5 3.5-.5 5 .5v9c-1.5-.8-3.3-.8-4.8-.2L8 13l-2.2-.7C4.3 11.7 3.5 11.7 2 12.5v-9ZM7.5 5 7 4.8c-1.2-.4-2.7-.3-3.8.4v6.3c1.2-.5 2.6-.5 3.8-.1l.5.2V5Zm1 6.6.5-.2c1.2-.4 2.6-.4 3.8.1V5.2c-1.1-.7-2.6-.8-3.8-.4L8.5 5v6.6Z"/></svg>
            </span>
            Charter Schools
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
